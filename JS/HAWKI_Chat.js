import * as Utils from './utils/utils';
import * as Crypt from './utils/encryption';
import * as Handshake from './utils/handshake_functions';


class HAWKI_Chat {

    userToken;
    hawkiUrl;
    roomsList;

    constructor(apiUrl){
        this.hawkiUrl = apiUrl;

    }



    init(userToken){



        this.userToken = '1|J9XqbKL3vfbrkb1nU1ceSFoDz3D0HmyrlE21hRs3090e619f'
        // this.userToken = userToken;
        //test connection to the server


        //init users rooms
        this.roomsList = this.getRoomsList();

        this.roomsList.forEach(room => {
            this.subscribeToRoomWSChannel(room.slug);
        });



    }

    //#region AUTHENTICATION



    //#endregion



    
    // #region ROOM CONTROLS
    async getRoomsList(){
        url = `${hawkiUrl}/user/rooms`
        const data = await Utils.fetchData(url, this.userToken);
        return data.rooms;
    }

    async getRoomContent(room_slug){

        const fetchRoomContent = `${hawkiUrl}/req/room/${room_slug}`
        const roomData = await Utils.fetchData(fetchRoomContent, this.userToken);


        const roomKey = await Crypt.keychainGet(slug);
        const aiCryptoSalt = await Crypt.fetchServerSalt('AI_CRYPTO_SALT');
        const aiKey = await Crypt.deriveKey(roomKey, slug, aiCryptoSalt);
    
        if(roomData.room_description){
            const descriptObj = JSON.parse(roomData.room_description);
            roomData.room_description = await decryptWithSymKey(roomKey, descriptObj.ciphertext, descriptObj.iv, descriptObj.tag, false);
        }
        if(roomData.system_prompt){
            const systemPromptObj = JSON.parse(roomData.system_prompt);
            roomData.system_prompt = await decryptWithSymKey(roomKey, systemPromptObj.ciphertext, systemPromptObj.iv, systemPromptObj.tag, false);
        }

        let decryptedMsgs = [];
        for (const msgData of roomData.messagesData) {
            const key = msgData.message_role === 'assistant' ? aiKey : roomKey;
            msgData.content = await decryptWithSymKey(key, msgData.content, msgData.iv, msgData.tag, false);
            decryptedMsgs.push(msgData);
        }
        roomData.messagesData = decryptedMsgs;

        return roomData;
    }
    

    /**
     * 
     * @param {Array} requestData 
     * requestData = {
     *      name,
     *      invitedMembers
     * }
     * 
     * 
     * 
     */
    async submitNewRoom(requestData){
        const url = `${hawkiUrl}/req/room/createRoom`
        const requestObj = {
            'room_name': requestData.name,
        }
        const roomData = await Utils.postData(url, this.userToken, requestObj)
                
        // Generate encryption key for the room
        const roomKey = await Crypt.generateKey();  // From encryption.js
        await Crypt.keychainSet(roomData.slug, roomKey, true);  // From encryption.js

        // Encrypt room description and system prompt
        const cryptDescription = await Crypt.encryptWithSymKey(roomKey, description, false);  // From encryption.js
        const descriptionStr = JSON.stringify({
            'ciphertext': cryptDescription.ciphertext,
            'iv': cryptDescription.iv,
            'tag': cryptDescription.tag,
        });
        
        const cryptSystemPrompt = await Crypt.encryptWithSymKey(roomKey, systemPrompt, false);  // From encryption.js
        const systemPromptStr = JSON.stringify({
            'ciphertext': cryptSystemPrompt.ciphertext,
            'iv': cryptSystemPrompt.iv,
            'tag': cryptSystemPrompt.tag,
        });

        // Prepare attributes for room update
        const roomAttributes = {
            'system_prompt': systemPromptStr,
            'description': descriptionStr,
            'img': avatar_url     
        }

        await this.updateRoomInfo(roomData.slug, roomAttributes);

        // Create and send invitations to members
        await createAndSendInvitations(requestData.invitedMembers, roomData.slug);


        return roomData;
    }

    async updateRoomInfo(slug, attributes){
        const url = `/req/room/updateInfo/${slug}`; 

        let requestObj = {};
        if(attributes.systemPrompt) requestObj.system_prompt = attributes.systemPrompt;
        if(attributes.description) requestObj.description = attributes.description;
        if(attributes.name) requestObj.name = attributes.name;
        if(attributes.img) requestObj.img = attributes.img;

        try{
            return await Utils.postData(url, this.userToken, requestObj);
        }
        catch(e){
            return e;
        }
    }

    async deleteRoom(slug){
        const url = `${this.hawkiUrl}/req/room/removeRoom/${slug}`;
        const success = await Utils.requestDelete(url, this.userToken);
        return success;
    }
    
    async leaveRoom(slug){
        const url = `/req/room/leaveRoom/${slug}`;
        const success = await Utils.requestDelete(url, this.userToken);
        return success;
    }

    async kickMember(slug, username){
        const url = `/req/room/leaveRoom/${slug}`;
        const success = await Utils.requestDelete(url, this.userToken, username);
        return success;
    }


    subscribeToRoomBroadcaster(roomsList, onBroadcasterCallback){
        roomsList.forEach(room => {
            Utils.connectWebSocket(room.slug, onBroadcasterCallback);
        });
    }


    //#endregion
    // #region MESSAGE CONTROLS
    async submitMessage(inputText, threadNumber, roomSlug){
        return await Utils.onSubmitMessageToServer(inputText, threadNumber, roomSlug, this.userToken);

    }
    //#endregion
    
    // #region SEARCH
    async searchUser(query){
        return await Utils.onSearchUser(query);
    }


    //#endregion
    // #region INVITATIONS
    async sendInvitations(listOfInvitees, slug){
        await Utils.createAndSendInvitations(listOfInvitees, slug);
    }


    async getUserInvitations(onBroadcasterCallback){
        const url = `${this.hawkiUrl}/req/inv/requestUserInvitations`
        const invData = Utils.fetchData(url, this.userToken);
        const formattedInvitations = invData.formattedInvitations;

        try{
            const roomKey = await Utils.handleUserInvitations(formattedInvitations);
            if (roomKey) {
                const acceptUrl = `${this.hawkiUrl}/req/inv/roomInvitationAccept`
                const roomData = await Utils.acceptInvitation(inv.invitation_id, roomKey, acceptUrl)
                Utils.connectWebSocket(roomData.slug,onBroadcasterCallback);
            }
            else{
                console.error('Bad Invitation Format!');
            }
        }
        catch(e){
            console.error(e);
        }
    }

}