import { IModel } from '../models/Model';
import { maskApiKey } from './encryption';

export function serializeModel(model: IModel | null) {
  if (!model) return null;

  const doc = model.toObject ? model.toObject() : model;

  return {
    ...doc,
    id: doc._id?.toString() || doc.id,
    apiKey: maskApiKey(doc.apiKeyHint),
    hasApiKey: Boolean(doc.apiKey),
    apiKeyHint: undefined,
  };
}

export function serializeModels(models: IModel[]) {
  return models.map((model) => serializeModel(model));
}
