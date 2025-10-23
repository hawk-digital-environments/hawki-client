import {
    type DefaultModelType,
    type DefaultModelTypeAlias,
    defaultModelTypeAliasMap,
    type DefaultModelTypeOrAlias,
    type SystemModelType,
    systemModelTypes,
    type SystemPromptType
} from './ai.js';
import {defineFeature} from '../features/features.js';
import type {ResourceType} from '../resources/resources.js';
import {createGenericStore} from '../resources/stores/GenericStore.js';
import {deriveMap} from '../resources/stores/utils.js';

export const AiFeature = defineFeature((connection) => {
    const {
        resourceDb,
        config: {featureFlags, ai: {defaultModels: defaultModelMap, systemModels: systemModelMap}}
    } = connection;

    const promptRecords = resourceDb.getTable('system_prompt');
    const modelRecords = resourceDb.getTable('ai_model');

    // noinspection UnnecessaryLocalVariableJS
    const aiInGroupEnabled = featureFlags.aiInGroups;

    const aiEnabled = aiInGroupEnabled; // Future feature flags can be added here

    const runIfEnabledOrFail = <T>(fn: () => T): T => {
        if (!aiEnabled) {
            throw new Error('AI features are not enabled');
        }
        return fn();
    };

    /**
     * Returns a list of all available AI models.
     * Note: The models are only available when any of the respective feature flags are enabled.
     */
    const list = () =>
        runIfEnabledOrFail(() => modelRecords.list.get(
            'all',
            (table) => table.toArray()
        ));

    /**
     * Returns a single AI model by its ID.
     * You can either use the string model id like "gpt-4o" or the numeric internal id.
     * Note: The models are only available when any of the respective feature flags are enabled.
     * @param id
     */
    const one = (id: string | number) => {
        const idIsNumeric = typeof id === 'number' || /^\d+$/.test(id);
        id = idIsNumeric ? Number(id) : id;
        return modelRecords.one.get(
            id.toString(),
            (table) => idIsNumeric
                ? table.get(id as number)
                : table.where('model_id').equals(id as string).first()
        );
    };

    const map = () => list()
        .derive('map', list => deriveMap(list, item => item.model_id));

    /**
     * Returns the record of all default AI models.
     * The keys of the record are the model types or aliases, the values are the respective AI model records.
     * Note: The models are only available when any of the respective feature flags are enabled.
     */
    const defaultModels = () =>
        runIfEnabledOrFail(() => map()
            .derive(
                'defaultModels',
                (models) => {
                    // As long as the model storage is empty we can not provide default models
                    if (models.size === 0) {
                        return undefined;
                    }

                    const result = {} as Record<DefaultModelTypeOrAlias, ResourceType<'ai_model'>>;
                    for (const [alias, type] of Object.entries(defaultModelTypeAliasMap)) {
                        const model = getOneByTypeByMapOrFail(models, defaultModelMap, type, 'default');
                        result[alias as DefaultModelTypeAlias] = model;
                        result[type as DefaultModelType] = model;
                    }
                    return result;
                }
            ));

    /**
     * Returns the default AI model for a given type or alias.
     * If no specific default model is set for the type, the model with the alias "default" will be returned.
     * Note: The models are only available when any of the respective feature flags are enabled.
     * @param type
     */
    const defaultModel = (type: DefaultModelTypeOrAlias) =>
        runIfEnabledOrFail(() => defaultModels()
            .derive(
                `defaultModel(${type})`,
                (models) =>
                    models
                        ? getOneOfRecordOrFail(models, type, 'default')
                        : undefined
            )
        );

    /**
     * Returns the record of all system AI models.
     * The keys of the record are the model types, the values are the respective AI model records.
     * Note: The models are only available when any of the respective feature flags are enabled.
     */
    const systemModels = () =>
        runIfEnabledOrFail(() => map()
            .derive(
                'systemModels',
                (models) => {
                    // As long as the model storage is empty we can not provide system models
                    if (models.size === 0) {
                        return undefined;
                    }
                    const result = {} as Record<SystemModelType, ResourceType<'ai_model'>>;
                    for (const type of Object.keys(systemModelTypes)) {
                        result[type] = getOneByTypeByMapOrFail(models, systemModelMap, type, 'system');
                    }
                    return result;
                }
            ));

    /**
     * Returns the list of all available system AI models.
     * System models are special models that can be used for system prompts and other advanced use cases.
     * Note: The models are only available when any of the respective feature flags are enabled.
     * @param type
     */
    const systemModel = (type: SystemModelType) =>
        runIfEnabledOrFail(() =>
            systemModels()
                .derive(
                    `systemModel(${type})`,
                    (models) =>
                        models
                            ? getOneOfRecordOrFail(models, type, 'system')
                            : undefined
                )
        );

    const currentModelId = createGenericStore<null | string>(null);

    /**
     * Returns the currently selected AI model.
     * This represents the text model that will be used for text generation.
     * You can change the current model using `setCurrentModel`.
     * Note: The models are only available when any of the respective feature flags are enabled.
     */
    const currentModel = () =>
        runIfEnabledOrFail(() => map()
            .derive(
                'currentModel',
                (models, currentModelId) => {
                    if (currentModelId === null) {
                        return null;
                    }
                    return models.get(currentModelId) || null;
                },
                [currentModelId]
            ));


    let setId = 0;
    /**
     * Sets the currently selected AI model.
     * You can either provide the string model id like "gpt-4o", the object representation of the model,
     * or the numeric internal id.
     * Note: The models are only available when any of the respective feature flags are enabled.
     * @param model
     */
    const setCurrentModel = (model: ResourceType<'ai_model'> | string | number) =>
        runIfEnabledOrFail(async () => {
            let resolvedModelId: string | null;
            if (typeof model === 'string' || typeof model === 'number') {
                const thisSetId = ++setId;
                const resolvedModel = await one(model).getAsync();
                if (thisSetId !== setId) {
                    return;
                }
                if (!resolvedModel) {
                    throw new Error(`No model found for id ${model}`);
                }
                resolvedModelId = resolvedModel.model_id;
            } else {
                resolvedModelId = model ? model.model_id : null;
            }

            currentModelId.set(resolvedModelId);
        });

    /**
     * Returns the system prompt for a given type.
     * System prompts are predefined prompts that can be used to guide the AI model's behavior.
     * @param type
     */
    const systemPrompt = (type: SystemPromptType) =>
        promptRecords.list.get(
            type,
            table => table.where('type').equals(type).toArray()
        ).derive(
            'localized',
            (prompts, locale) =>
                prompts.find(p => p.locale === locale.lang) || null,
            [connection.locale]
        ).derive(
            'text',
            (prompt) => prompt ? prompt.text : null
        );

    // Automatically set the current model to the default text model if not set
    if (aiEnabled) {
        defaultModels().subscribe((models) => {
            if (!models) {
                return;
            }
            const defaultTextModel = models['text'];
            if (currentModelId.get() === null && defaultTextModel) {
                currentModelId.set(defaultTextModel.model_id);
            }
        });
    }

    return {
        list,
        one,
        currentModel,
        setCurrentModel,
        defaultModel,
        defaultModels,
        systemModel,
        systemModels,
        systemPrompt
    };
});


function getOneOfRecordOrFail<TModels extends Record<string, ResourceType<'ai_model'>>>(
    models: TModels,
    key: keyof TModels,
    type: string
) {
    if (!models[key]) {
        throw new Error(`No ${type} model found for type ${key as string}`);
    }
    return models[type];
}

function getOneByTypeByMapOrFail<TMap extends Record<string, string>>(
    models: Map<string, ResourceType<'ai_model'>>,
    map: TMap,
    key: keyof TMap,
    type: string
) {
    if (!map[key]) {
        throw new Error(`No ${type} model configured for ${key as string}`);
    }
    const modelId = map[key];
    const model = models.get(modelId);
    if (!model) {
        throw new Error(`No ${type} model found for id ${modelId} (for type ${key as string})`);
    }
    return model;
}
