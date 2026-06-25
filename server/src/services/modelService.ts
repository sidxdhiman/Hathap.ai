import Agent from '../models/Agent';
import Model, { IModel } from '../models/Model';
import {
  decryptApiKey,
  encryptApiKey,
  getApiKeyHint,
  isEncrypted,
  isMaskedApiKeyValue,
} from '../utils/encryption';

export async function assignModelToUnassignedAgents(
  userId: string,
  modelId: string
): Promise<number> {
  const result = await Agent.updateMany(
    {
      userId,
      $or: [{ assignedModelId: null }, { assignedModelId: { $exists: false } }],
    },
    { assignedModelId: modelId }
  );
  return result.modifiedCount || 0;
}

export async function isFirstUserModel(userId: string): Promise<boolean> {
  const count = await Model.countDocuments({ userId });
  return count <= 1;
}

export function applyApiKeyToModel(model: IModel, incomingKey?: string): void {
  if (!incomingKey || isMaskedApiKeyValue(incomingKey)) {
    return;
  }

  model.apiKey = encryptApiKey(incomingKey);
  model.apiKeyHint = getApiKeyHint(incomingKey);
}

export async function migratePlainTextApiKeys(userId: string): Promise<void> {
  const models = await Model.find({ userId });
  for (const model of models) {
    if (model.apiKey && !isEncrypted(model.apiKey)) {
      const plain = model.apiKey;
      model.apiKey = encryptApiKey(plain);
      model.apiKeyHint = getApiKeyHint(plain);
      await model.save();
    }
  }
}

export function getDecryptedApiKey(model: IModel): string {
  return decryptApiKey(model.apiKey);
}

export function modelForLlmCall(model: IModel): IModel {
  return {
    ...model.toObject(),
    apiKey: getDecryptedApiKey(model),
  } as IModel;
}
