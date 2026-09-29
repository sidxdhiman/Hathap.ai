import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  authVersion: number;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  /**
   * Monotonic counter embedded in every credential issued to this user (the
   * `av` JWT claim). Incrementing it invalidates every token previously issued
   * to the user in a single write, which is what makes logout, password change
   * and account deletion able to end a session server-side.
   *
   * Documents created before this field existed have no stored value. Readers
   * normalize a missing/non-numeric value to 0 via `readAuthVersion`, and tokens
   * issued before the claim existed carry no `av` and are likewise treated as
   * version 0, so no backfill migration is required and no user is forced to
   * sign in again on deploy.
   */
  authVersion: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IUser>('User', UserSchema);
