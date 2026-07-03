import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Top 5 Things — one document per user per ISO week (see lib/top5).
 *
 * Deliberately NOT an audited GxP record: it's a thinking channel, and the
 * moment thoughts become compliance artifacts people stop writing the honest
 * ones. Items are short lines, capped at five.
 */
const Top5Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** ISO week key, e.g. "2026-W27". */
    week: { type: String, required: true },
    items: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 5, 'Top 5 means five'],
    },
  },
  { timestamps: true },
);

Top5Schema.index({ userId: 1, week: 1 }, { unique: true });
// Feed query: latest entries across a member set, newest first.
Top5Schema.index({ updatedAt: -1 });

export type Top5Doc = InferSchemaType<typeof Top5Schema> & { _id: mongoose.Types.ObjectId };

export const Top5: Model<Top5Doc> =
  (mongoose.models.Top5 as Model<Top5Doc>) || mongoose.model<Top5Doc>('Top5', Top5Schema);
