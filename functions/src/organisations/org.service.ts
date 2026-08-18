import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { Organisation, Member } from '../shared/types';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../shared/errors';

export class OrganisationService {
  /**
   * Creates a new organization with the creator as the first ADMIN member.
   */
  static async createOrganisation(
    db: admin.firestore.Firestore,
    params: {
      name: string;
      currency?: string;
      creatorId: string;
      creatorEmail: string;
      creatorDisplayName?: string;
    }
  ): Promise<{ organisationId: string; organisation: Organisation }> {
    if (!params.name || params.name.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Organization name is required.');
    }

    const orgId = uuidv4();
    const now = Timestamp.now();

    const orgData: Organisation = {
      id: orgId,
      name: params.name.trim(),
      currency: params.currency || 'INR',
      createdBy: params.creatorId,
      createdAt: now,
      updatedAt: now,
      settings: {
        duplicateWindowDays: 30,
        mockRefundOutcome: 'SUCCESS'
      }
    };

    const memberData: Member = {
      id: params.creatorId,
      organisationId: orgId,
      email: params.creatorEmail,
      displayName: params.creatorDisplayName || params.creatorEmail.split('@')[0],
      role: 'ADMIN',
      joinedAt: now
    };

    const batch = db.batch();
    const orgRef = db.collection('organisations').doc(orgId);
    const memberRef = orgRef.collection('members').doc(params.creatorId);
    const userRef = db.collection('users').doc(params.creatorId);

    batch.set(orgRef, orgData);
    batch.set(memberRef, memberData);
    batch.set(
      userRef,
      {
        email: params.creatorEmail,
        displayName: params.creatorDisplayName || params.creatorEmail.split('@')[0],
        organisations: admin.firestore.FieldValue.arrayUnion(orgId),
        updatedAt: now
      },
      { merge: true }
    );

    await batch.commit();

    await AuditService.record(db, {
      organisationId: orgId,
      actorId: params.creatorId,
      actorEmail: params.creatorEmail,
      action: 'ORGANISATION_CREATED',
      entityType: 'ORGANISATION',
      entityId: orgId,
      after: { name: orgData.name, currency: orgData.currency }
    });

    return { organisationId: orgId, organisation: orgData };
  }

  /**
   * Updates organization settings.
   */
  static async updateSettings(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      actorId: string;
      actorEmail?: string;
      settings: Partial<NonNullable<Organisation['settings']>>;
    }
  ): Promise<void> {
    const orgRef = db.collection('organisations').doc(params.organisationId);
    const doc = await orgRef.get();
    if (!doc.exists) {
      throw new AppError('NOT_FOUND', 'Organisation not found.');
    }

    const currentData = doc.data() as Organisation;
    const now = Timestamp.now();

    await orgRef.update({
      settings: {
        ...(currentData.settings || {}),
        ...params.settings
      },
      updatedAt: now
    });
  }
}
