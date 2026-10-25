import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito User Pool – email/password auth with patient & clinician groups.
 * No demo users; accounts are created via sign-up.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    givenName: { required: true, mutable: true },
    familyName: { required: true, mutable: true },
    // role stored as custom attribute: "patient" | "clinician"
    'custom:role': {
      dataType: 'String',
      mutable: true,
      maxLen: 20,
    },
  },
  groups: ['Patients', 'Clinicians'],
});
