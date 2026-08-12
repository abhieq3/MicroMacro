import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * One row per new-task suggest interaction.
 *
 * This is the training table for the assignee + duration ranker:
 * what we showed, which variant showed it, what the lead actually saved.
 * Accept vs override is derived, never stored as free text.
 */
const SuggestionEventSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, default: '' },
    variant: { type: String, enum: ['heuristic', 'ranker'], required: true },
    suggestedAssigneeId: { type: String, default: '' },
    suggestedDueDate: { type: String, default: '' },
    chosenAssigneeId: { type: String, default: '' },
    chosenDueDate: { type: String, default: '' },
    acceptedAssignee: { type: Boolean, default: false },
    acceptedDue: { type: Boolean, default: false },
    modelVersion: { type: String, default: 'v1' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SuggestionEventSchema.index({ projectId: 1, createdAt: -1 });
SuggestionEventSchema.index({ variant: 1, createdAt: -1 });

export type SuggestionEventDoc = InferSchemaType<typeof SuggestionEventSchema>;

export const SuggestionEvent: Model<SuggestionEventDoc> =
  (mongoose.models.SuggestionEvent as Model<SuggestionEventDoc>) ||
  mongoose.model<SuggestionEventDoc>('SuggestionEvent', SuggestionEventSchema);
