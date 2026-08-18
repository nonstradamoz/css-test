import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { AuditAction, AuditLog } from '../shared/types';

export interface CreateAuditLogParams {
  organisationId: string;
  actorId: string;
  actorEmail?: string;
  action: AuditAction;
  entityType: 'EXPENSE' | 'REIMBURSEMENT' | 'MEMBER' | 'ORGANISATION' | 'RECEIPT';
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export class AuditService {
  /**
   * Records an immutable audit log entry.
   * Can be executed within a transaction or standalone.
   */
  static async record(
    db: admin.firestore.Firestore,
    params: CreateAuditLogParams,
    tx?: admin.firestore.Transaction
  ): Promise<AuditLog> {
    const auditId = uuidv4();
    const auditRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('auditLogs')
      .doc(auditId);

    const logEntry: AuditLog = {
      id: auditId,
      organisationId: params.organisationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail || 'system',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before || null,
      after: params.after || null,
      metadata: params.metadata || {},
      requestId: params.requestId || uuidv4(),
      timestamp: Timestamp.now()
    };

    if (tx) {
      tx.set(auditRef, logEntry);
    } else {
      await auditRef.set(logEntry);
    }

    return logEntry;
  }
}
