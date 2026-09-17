import mongoose, { Schema, Document } from 'mongoose';

export interface IBenchmark extends Document {
  userId: Schema.Types.ObjectId | string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  tags: string[];
  defaultRubricId?: Schema.Types.ObjectId | string;
  createdAt: Date;
  updatedAt: Date;
}

const BenchmarkSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
    version: { type: Number, default: 1 },
    tags: [{ type: String }],
    defaultRubricId: { type: Schema.Types.ObjectId, ref: 'Rubric' },
  },
  { timestamps: true }
);

BenchmarkSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IBenchmark>('Benchmark', BenchmarkSchema);