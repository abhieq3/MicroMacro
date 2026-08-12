import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * One whiteboard document per user. The whole stroke list lives in a single
 * document — single-user surface, small payload, atomic save semantics.
 * Owner-private: no cross-user query path; admin views never read it.
 */
const StrokePointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

const StrokeSchema = new Schema(
  {
    id: { type: String },
    tool: {
      type: String,
      enum: ['pen', 'highlighter', 'eraser', 'text', 'rect', 'ellipse', 'arrow'],
      default: 'pen',
    },
    color: { type: String, default: '#0f172a' },
    size: { type: Number, default: 2.5 },
    points: { type: [StrokePointSchema], default: [] },
    text: { type: String, default: '' },
    promotedTaskId: { type: String, default: '' },
  },
  { _id: false },
);

const WhiteboardSchema = new Schema(
  {
    // Personal pad (legacy). Sparse so project boards don't need a userId.
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    // One living board per project — team-visible.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', unique: true, sparse: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    strokes: { type: [StrokeSchema], default: [] },
  },
  { timestamps: true },
);

export type WhiteboardDoc = InferSchemaType<typeof WhiteboardSchema>;
export const Whiteboard =
  (mongoose.models.Whiteboard as mongoose.Model<WhiteboardDoc>) ||
  mongoose.model<WhiteboardDoc>('Whiteboard', WhiteboardSchema);
