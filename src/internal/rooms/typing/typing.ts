import {defineResource} from '../../resources/resources.js';

export const RoomAiWritingResource = defineResource<{
    id: number; // The id of the room
    model_id: string;
    label: string;
}>()({
    transient: true
});
