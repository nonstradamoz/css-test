import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../shared/errors';
import { Member, Role } from '../shared/types';
import { AuditService } from '../audit/audit.service';

export class MemberService {
  /**
   * Invites a new member or directly adds them to the organisation.
   */
  static async inviteMember(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      email: string;
      role: Role;
      actorId: string;
      actorEmail?: string;
    }
  ): Promise<{ invitationId: string }> {
    const orgRef = db.collection('organisations').doc(params.organisationId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) {
      throw new AppError('NOT_FOUND', 'Organisation not found.');
    }

    const invitationId = uuidv4();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 86400 * 1000); // 7 days

    const invitation = {
      id: invitationId,
      organisationId: params.organisationId,
      email: params.email.trim().toLowerCase(),
      role: params.role,
      invitedBy: params.actorId,
      status: 'PENDING',
      createdAt: now,
      expiresAt
    };

    await orgRef.collection('invitations').doc(invitationId).set(invitation);

    // If a user with this email already exists in Auth/Firestore, we can also link or create member directly
    try {
      const userRecord = await admin.auth().getUserByEmail(params.email.trim().toLowerCase());
      if (userRecord && userRecord.uid) {
        const memberRef = orgRef.collection('members').doc(userRecord.uid);
        const memberData: Member = {
          id: userRecord.uid,
          organisationId: params.organisationId,
          email: userRecord.email || params.email,
          displayName: userRecord.displayName || params.email.split('@')[0],
          role: params.role,
          joinedAt: now,
          invitedBy: params.actorId
        };
        await memberRef.set(memberData);

        await db
          .collection('users')
          .doc(userRecord.uid)
          .set(
            {
              organisations: admin.firestore.FieldValue.arrayUnion(params.organisationId),
              updatedAt: now
            },
            { merge: true }
          );
      }
    } catch {
      // User hasn't registered yet; they can claim invitation on sign-up
    }

    await AuditService.record(db, {
      organisationId: params.organisationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      action: 'MEMBER_INVITED',
      entityType: 'MEMBER',
      entityId: invitationId,
      after: { email: params.email, role: params.role }
    });

    return { invitationId };
  }

  /**
   * Modifies an existing member's role (ADMIN only).
   */
  static async changeMemberRole(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      targetMemberId: string;
      newRole: Role;
      actorId: string;
      actorEmail?: string;
    }
  ): Promise<void> {
    const memberRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('members')
      .doc(params.targetMemberId);

    const doc = await memberRef.get();
    if (!doc.exists) {
      throw new AppError('NOT_FOUND', 'Member not found in organisation.');
    }

    const currentMember = doc.data() as Member;
    const oldRole = currentMember.role;

    if (oldRole === params.newRole) {
      return;
    }

    // Safety: prevent demoting the last ADMIN
    if (oldRole === 'ADMIN' && params.newRole !== 'ADMIN') {
      const adminsSnapshot = await db
        .collection('organisations')
        .doc(params.organisationId)
        .collection('members')
        .where('role', '==', 'ADMIN')
        .get();

      if (adminsSnapshot.size <= 1) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Cannot demote the only administrator of the organisation.'
        );
      }
    }

    const now = Timestamp.now();
    await memberRef.update({
      role: params.newRole,
      updatedAt: now
    });

    await AuditService.record(db, {
      organisationId: params.organisationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      action: 'ROLE_CHANGED',
      entityType: 'MEMBER',
      entityId: params.targetMemberId,
      before: { role: oldRole },
      after: { role: params.newRole }
    });
  }

  /**
   * Removes a member from an organisation.
   */
  static async removeMember(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      targetMemberId: string;
      actorId: string;
      actorEmail?: string;
    }
  ): Promise<void> {
    const memberRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('members')
      .doc(params.targetMemberId);

    const doc = await memberRef.get();
    if (!doc.exists) {
      throw new AppError('NOT_FOUND', 'Member not found.');
    }

    const currentMember = doc.data() as Member;

    if (currentMember.role === 'ADMIN') {
      const adminsSnapshot = await db
        .collection('organisations')
        .doc(params.organisationId)
        .collection('members')
        .where('role', '==', 'ADMIN')
        .get();

      if (adminsSnapshot.size <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Cannot remove the last administrator.');
      }
    }

    await memberRef.delete();

    await db
      .collection('users')
      .doc(params.targetMemberId)
      .set(
        {
          organisations: admin.firestore.FieldValue.arrayRemove(params.organisationId)
        },
        { merge: true }
      );

    await AuditService.record(db, {
      organisationId: params.organisationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      action: 'MEMBER_REMOVED',
      entityType: 'MEMBER',
      entityId: params.targetMemberId,
      before: { email: currentMember.email, role: currentMember.role }
    });
  }
}
