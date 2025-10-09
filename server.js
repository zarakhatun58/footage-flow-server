


export const getNewLoginUrl=()=>{
const uri=`https://accounts.google.com/o/oauth2/v2/auth?
client_id=${process.env.GOOGLE_CLIENT_ID}&
redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&
access_type=offLine&
response_type=code&
scope=https://www.googleapis.com/auth/photoslibrary.readonly&
state=new_access_token&
include_granted_scope=true&
prompt=consent`;
return axios.get(url);
}

export const handler=(req, method)=>{
    if(req=== "/test"){
        return "yep testing"
    }
    const {body} =req;
}