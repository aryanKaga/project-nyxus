const vscode = require('vscode')
const fs = require('fs')
const path = require('path')


const config = vscode.workspace.getConfiguration('nyxus')
const url = config.get('url')
const {get_nyxus_auto_memory}  = require('./helper_functions/nyxus_auto_memmory.js')
function gather_folder_data(){
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if(!workspaceRoot){
            return
        }
    const datadir = path.join(workspaceRoot,'.nyxus')
    const graph_path  = path.join(datadir,'repo-mapping.json')
    const folder_structure_dir= path.join(datadir,'directory_structure.json')
    const graph_data = fs.readFileSync(graph_path,"utf-8")
    const folder_structure_data = fs.readFileSync(folder_structure_dir,"utf-8")
    return {graph_data,folder_structure_data}
}
/**
 * 
 * @param {*} socket 
 */



async function check_auto_memmory(socket){
    const auto_memmory = await get_nyxus_auto_memory()
    console.log('sending data to server')
    const apikey = config.get('apiKey')
    
    const code_data = gather_folder_data()
    const root_dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;    
    if(auto_memmory && auto_memmory !== 'false'){
        socket.emit('send_auto_memmory',{auto_memmory: auto_memmory,apikey:apikey})
    }
}



/**
 * 
 * @param {*} socket 
 */

async function send_init_data(socket){
    console.log('sending data to server')
    const apikey = config.get('apiKey')
    
    const code_data = gather_folder_data()
    const root_dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const auto_memmory = await get_nyxus_auto_memory()
    if(!code_data){ 
        console.error('[Nyxus] No code data found to send');
        return;
    }
    socket.emit(  //emitting folder data to the server
    'handle_folder_data',
    {
        apiKey: apikey,
        graph_data: code_data.graph_data,
        folder_structure_data: code_data.folder_structure_data,
        root_dir: root_dir,
        auto_memmory:auto_memmory
    },
    /**
     * 
     * @param {*} response 
     */
    (response) => {

            console.log("Server response:", response);

            if (response.status === "ok") {
                console.log("Data delivered successfully");
            }
            else {
                console.log("Delivery failed");
            }

    }
    );
    console.log(code_data)
    console.log('data sent')
    
}

module.exports= {send_init_data, check_auto_memmory}    