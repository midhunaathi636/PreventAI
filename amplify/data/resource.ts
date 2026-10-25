import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Amplify Data (AppSync + DynamoDB)
 * Includes appointments (1 patient per slot), notes, prescriptions, care plans.
 */
const schema = a.schema({
  Profile: a
    .model({
      email: a.string().required(),
      role: a.enum(['patient', 'clinician', 'doctor']),
      firstName: a.string().required(),
      lastName: a.string().required(),
      dateOfBirth: a.string(),
      gender: a.string(),
      phone: a.string(),
      address: a.string(),
      healthPreferences: a.json(),
      constraints: a.string().array(),
      geneticMarkers: a.json(),
      clinicianId: a.id(),
    })
    .authorization((allow) => [
      allow.owner(),
      // Clinicians need to read all patients and set clinicianId assignment
      allow.authenticated().to(['read', 'update']),
    ]),

  RiskScore: a
    .model({
      patientId: a.id().required(),
      cvdRisk: a.float(),
      diabetesRisk: a.float(),
      cancerRisk: a.float(),
      strokeRisk: a.float(),
      overallRisk: a.float().required(),
      riskLevel: a.enum(['low', 'moderate', 'high', 'very_high']),
      contributingFactors: a.string().array(),
      recordedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  PreventionPlan: a
    .model({
      patientId: a.id().required(),
      clinicianId: a.id(),
      status: a.enum(['draft', 'pending_review', 'active', 'completed', 'overridden']),
      title: a.string(),
      summary: a.string(),
      expectedRiskReduction: a.float(),
      aiExplanation: a.string(),
      safetyVerified: a.boolean(),
      safetyNotes: a.string(),
      approvedBy: a.id(),
      approvedAt: a.datetime(),
      planVersion: a.integer(),
      reviewComments: a.string(),
      actions: a.hasMany('PlanAction', 'planId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'update']),
    ]),

  PlanAction: a
    .model({
      planId: a.id().required(),
      plan: a.belongsTo('PreventionPlan', 'planId'),
      domain: a.enum(['lifestyle', 'screening', 'behavioral', 'medication_adherence']),
      title: a.string().required(),
      description: a.string(),
      frequency: a.string(),
      expectedImpact: a.float(),
      status: a.enum(['pending', 'in_progress', 'completed']),
      sortOrder: a.integer(),
      targetDate: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'update']),
    ]),

  AdherenceLog: a
    .model({
      planActionId: a.id().required(),
      patientId: a.id().required(),
      completed: a.boolean().required(),
      notes: a.string(),
      completedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  WearableDevice: a
    .model({
      patientId: a.id().required(),
      deviceType: a.string().required(),
      deviceName: a.string().required(),
      manufacturer: a.string(),
      status: a.enum(['connected', 'disconnected']),
      lastSyncedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),

  WearableReading: a
    .model({
      patientId: a.id().required(),
      deviceId: a.id(),
      readingType: a.string().required(),
      value: a.float().required(),
      unit: a.string(),
      deviceType: a.string(),
      recordedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  Notification: a
    .model({
      userId: a.id().required(),
      type: a.enum([
        'risk_alert',
        'plan_update',
        'adherence_reminder',
        'agent_activity',
        'system',
      ]),
      title: a.string().required(),
      body: a.string(),
      read: a.boolean().default(false),
    })
    .authorization((allow) => [allow.owner()]),

  AgentActivity: a
    .model({
      patientId: a.id().required(),
      agentType: a.enum(['risk', 'plan_generation', 'personalization', 'safety']),
      status: a.string(),
      message: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  Feedback: a
    .model({
      patientId: a.id().required(),
      planId: a.id(),
      rating: a.integer().required(),
      outcomeNotes: a.string(),
      symptomsImproved: a.boolean(),
      sideEffects: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  /** Doctor publishes open slots; only one patient can book each slot. */
  DoctorSlot: a
    .model({
      clinicianId: a.id().required(),
      slotDate: a.string().required(), // YYYY-MM-DD
      slotTime: a.string().required(), // HH:MM
      durationMinutes: a.integer().default(30),
      isBooked: a.boolean().default(false),
      appointmentId: a.id(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'update']),
    ]),

  /** Appointment linked to a unique slot (one patient per slot). */
  Appointment: a
    .model({
      patientId: a.id().required(),
      clinicianId: a.id().required(),
      slotId: a.id(),
      appointmentDate: a.string().required(),
      appointmentTime: a.string().required(),
      status: a.enum(['requested', 'confirmed', 'completed', 'cancelled', 'rejected']),
      reason: a.string(),
      patientNotes: a.string(),
      clinicianNotes: a.string(),
      createdBy: a.id(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'update', 'create']),
    ]),

  /** Symptom / clinical notes written by doctor for a patient. */
  SymptomNote: a
    .model({
      patientId: a.id().required(),
      clinicianId: a.id().required(),
      appointmentId: a.id(),
      title: a.string().required(),
      details: a.string().required(),
      recordedAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create']),
    ]),

  /** Prescription issued by doctor. */
  Prescription: a
    .model({
      patientId: a.id().required(),
      clinicianId: a.id().required(),
      appointmentId: a.id(),
      medicationName: a.string().required(),
      dosage: a.string(),
      frequency: a.string(),
      duration: a.string(),
      notes: a.string(),
      startedOn: a.string(),
      endedOn: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'update']),
    ]),

  /** Care plan uploaded/created by doctor for a patient. */
  CarePlanDocument: a
    .model({
      patientId: a.id().required(),
      clinicianId: a.id().required(),
      appointmentId: a.id(),
      title: a.string().required(),
      content: a.string().required(),
      goals: a.string(),
      instructions: a.string(),
      followUpDate: a.string(),
      status: a.enum(['draft', 'active', 'completed']),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'update']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
