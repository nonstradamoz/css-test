import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { AppError } from './errors';
import { Member, Role } from './types';

export interface AuthContext {
  userId: string;
  email: string;
  displayName?: string;
}

export interface OrgAuthContext extends AuthContext {
  organisationId: string;
  member: Member;
  role: Role;
}

export function assertAuthenticated(request: CallableRequest): AuthContext {
  if (!request.auth || !request.auth.uid) {
    throw new AppError('UNAUTHENTICATED', 'Authentication is required to perform this action.');
  }

  return {
    userId: request.auth.uid,
    email: request.auth.token.email || '',
    displayName: request.auth.token.name || (request.auth.token.email ? request.auth.token.email.split('@')[0] : 'User')
  };
}

export async function assertOrgMembership(
  db: admin.firestore.Firestore,
  request: CallableRequest,
  organisationId: string
): Promise<OrgAuthContext> {
  const auth = assertAuthenticated(request);

  if (!organisationId) {
    throw new AppError('VALIDATION_ERROR', 'Organization ID must be provided.');
  }

  // Check if user is a global Super Admin
  const userDoc = await db.collection('users').doc(auth.userId).get();
  const isSuperAdmin = userDoc.exists && userDoc.data()?.isSuperAdmin === true;

  if (isSuperAdmin) {
    return {
      ...auth,
      organisationId,
      member: {
        id: auth.userId,
        organisationId,
        email: auth.email,
        displayName: auth.displayName || 'Super Admin',
        role: 'ADMIN',
        joinedAt: admin.firestore.Timestamp.now()
      },
      role: 'ADMIN'
    };
  }

  const memberDoc = await db
    .collection('organisations')
    .doc(organisationId)
    .collection('members')
    .doc(auth.userId)
    .get();

  if (!memberDoc.exists) {
    throw new AppError('UNAUTHORIZED', 'You are not a member of this organisation.');
  }

  const member = memberDoc.data() as Member;

  return {
    ...auth,
    organisationId,
    member,
    role: member.role
  };
}

export async function assertRole(
  db: admin.firestore.Firestore,
  request: CallableRequest,
  organisationId: string,
  allowedRoles: Role[]
): Promise<OrgAuthContext> {
  const orgAuth = await assertOrgMembership(db, request, organisationId);

  if (!allowedRoles.includes(orgAuth.role)) {
    throw new AppError(
      'UNAUTHORIZED',
      `Action requires one of the following roles: ${allowedRoles.join(', ')}. Your role is ${orgAuth.role}.`
    );
  }

  return orgAuth;
}
