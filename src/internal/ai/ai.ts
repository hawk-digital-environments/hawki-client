import {defineResource} from '../resources/resources.js';

export const defaultModelTypeAliasMap = {
    text: 'default_model',
    webSearch: 'default_web_search_model',
    fileUpload: 'default_file_upload_model',
    vision: 'default_vision_model'
} as const;

export type DefaultModelTypeAlias = keyof typeof defaultModelTypeAliasMap;
export type DefaultModelType = (typeof defaultModelTypeAliasMap)[DefaultModelTypeAlias];
export type DefaultModelTypeOrAlias = DefaultModelTypeAlias | DefaultModelType;

export const systemModelTypes = [
    'title_generator',
    'prompt_improver',
    'summarizer'
] as const;

export type SystemModelType = (typeof systemModelTypes)[number] | string;

export const AiModelResource = defineResource<{
    id: number;
    model_id: string;
    label: string;
    input: string[];
    output: string[];
    tools: Record<string, boolean>;
    status: 'online' | 'offline' | 'unknown';
}>()({
    indexedKeys: ['id', 'model_id']
});

export const systemPromptTypes = [
    'default',
    'summary',
    'improvement',
    'name'
] as const;

export type SystemPromptType = (typeof systemPromptTypes)[number];

export const SystemPromptResource = defineResource<{
    id: number;
    type: SystemPromptType,
    locale: string,
    text: string
}>()({
    indexedKeys: ['id', 'type', 'locale'],
    compositeIndexes: [['type', 'locale']]
});
