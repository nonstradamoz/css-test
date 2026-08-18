import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../shared/errors';
import { Expense, ReceiptMetadata, Role } from '../shared/types';
import { getStorageProvider } from './storage.service';
import { AuditService } from '../audit/audit.service';

export interface GenerateUploadUrlParams {
  organisationId: string;
  expenseId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  checksum: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
}

export interface GenerateDownloadUrlParams {
  organisationId: string;
  expenseId: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
}

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export class ReceiptService {
  /**
   * Generates a pre-signed URL for uploading a receipt to Cloudinary Storage.
   */
  static async generateUploadUrl(
    db: admin.firestore.Firestore,
    params: GenerateUploadUrlParams
  ): Promise<{ uploadUrl: string; storageKey: string; receiptId: string }> {
    if (!ALLOWED_CONTENT_TYPES.includes(params.contentType.toLowerCase())) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid file type '${params.contentType}'. Allowed: JPEG, PNG, WEBP, PDF.`
      );
    }

    if (params.fileSize > MAX_FILE_SIZE) {
      throw new AppError('VALIDATION_ERROR', 'Receipt file size exceeds maximum limit of 15MB.');
    }

    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    const expenseDoc = await expenseRef.get();
    if (!expenseDoc.exists) {
      throw new AppError('NOT_FOUND', 'Expense not found.');
    }

    const expense = expenseDoc.data() as Expense;

    // Only owner or admin can upload receipt for draft/changes requested
    if (expense.submittedBy !== params.actorId && params.userRole !== 'ADMIN') {
      throw new AppError('UNAUTHORIZED', 'You can only upload receipts for your own expenses.');
    }

    const receiptId = uuidv4();
    const extension = params.fileName.split('.').pop() || 'dat';
    const storageKey = `receipts/${params.organisationId}/${params.expenseId}/${receiptId}.${extension}`;

    const storageProvider = getStorageProvider();
    const uploadUrl = await storageProvider.generateUploadUrl(storageKey, params.contentType, 900);

    return { uploadUrl, storageKey, receiptId };
  }

  /**
   * Confirms upload and attaches metadata to the expense record.
   */
  static async attachReceiptMetadata(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      expenseId: string;
      receiptId: string;
      storageKey: string;
      fileName: string;
      contentType: string;
      fileSize: number;
      checksum: string;
      actorId: string;
      actorEmail?: string;
    }
  ): Promise<ReceiptMetadata> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    const now = Timestamp.now();
    const receiptMetadata: ReceiptMetadata = {
      id: params.receiptId,
      organisationId: params.organisationId,
      expenseId: params.expenseId,
      storageProvider: process.env.CLOUDINARY_CLOUD_NAME ? 'cloudinary' : 'cloudinary',
      storageKey: params.storageKey,
      fileName: params.fileName,
      contentType: params.contentType,
      fileSize: params.fileSize,
      checksum: params.checksum,
      uploadedBy: params.actorId,
      createdAt: now
    };

    const receiptRef = expenseRef.collection('receipts').doc(params.receiptId);

    await db.runTransaction(async (tx) => {
      tx.set(receiptRef, receiptMetadata);
      tx.update(expenseRef, {
        receipt: receiptMetadata,
        updatedAt: now
      });
    });

    await AuditService.record(db, {
      organisationId: params.organisationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      action: 'RECEIPT_UPLOADED',
      entityType: 'RECEIPT',
      entityId: params.receiptId,
      after: { fileName: params.fileName, fileSize: params.fileSize }
    });

    return receiptMetadata;
  }

  /**
   * Generates a pre-signed download URL with tenant and role verification.
   */
  static async generateDownloadUrl(
    db: admin.firestore.Firestore,
    params: GenerateDownloadUrlParams
  ): Promise<{ downloadUrl: string; fileName: string; contentType: string }> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    const expenseDoc = await expenseRef.get();
    if (!expenseDoc.exists) {
      throw new AppError('NOT_FOUND', 'Expense not found.');
    }

    const expense = expenseDoc.data() as Expense;

    // Reviewers, Finance, and Admins can view any receipt in their org; Members can only view their own
    if (
      params.userRole === 'MEMBER' &&
      expense.submittedBy !== params.actorId
    ) {
      throw new AppError('UNAUTHORIZED', 'You do not have permission to access this receipt.');
    }

    if (!expense.receipt?.storageKey) {
      throw new AppError('NOT_FOUND', 'No receipt attached to this expense.');
    }

    const storageProvider = getStorageProvider();
    const downloadUrl = await storageProvider.generateDownloadUrl(expense.receipt.storageKey, 900);

    return {
      downloadUrl,
      fileName: expense.receipt.fileName,
      contentType: expense.receipt.contentType
    };
  }
}
