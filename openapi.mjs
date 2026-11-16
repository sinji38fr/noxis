export function openapi(basePath=''){
 const json=schema=>({'application/json':{schema}}),object={type:'object'};
 const op=(summary,{body,params=[],binary=false,publicRoute=false,status='200'}={})=>({summary,security:publicRoute?[]:[{bearerAuth:[]}],parameters:params,...(body?{requestBody:{required:true,content:json(body)}}:{}),responses:{[status]:{description:'Success',content:binary?{'image/jpeg':{schema:{type:'string',format:'binary'}}}:json(object)},'400':{description:'Invalid request'},'401':{description:'Authentication required'},'502':{description:'NVR operation failed'}}});
 const string={type:'string'},integer={type:'integer'},id={name:'id',in:'path',required:true,schema:string},channel={name:'channel',in:'path',required:true,schema:{type:'integer',minimum:1,maximum:64}};
 const paths={
  '/healthz':{get:op('Noxis process health, without probing the NVR',{publicRoute:true})},
  '/api/config':{get:op('Public deployment settings, without credentials',{publicRoute:true})},
  '/api/status':{get:op('Last observed NVR health and export queue; no active probe')},
  '/api/cameras':{get:op('Camera identities, names and capabilities')},
  '/api/cameras/{channel}':{post:op('Set a shared camera name',{params:[channel],body:{type:'object',required:['name'],properties:{name:{type:'string',minLength:1,maxLength:60}}}})},
  '/api/cameras/{channel}/snapshot':{post:op('Capture one complete JPEG and close the source',{params:[channel],body:object,binary:true})},
  '/api/days':{get:op('Configured virtual dates; not proof of recordings')},
  '/api/info':{get:op('Read-only NVR device information')},
  '/api/recordings':{get:op('All camera records for a date',{params:[{name:'date',in:'query',required:true,schema:{type:'string',format:'date'}}]})},
  '/api/search':{post:op('Search selected cameras and recording events',{body:{type:'object',required:['Channel','Type','Date','BeginTime','EndTime','PageSize','CurrentPage'],properties:{Channel:{type:'array',items:{enum:['True','False']}},Type:{type:'array',items:{enum:['True','False']}},Date:{type:'string',format:'date'},BeginTime:string,EndTime:string,PageSize:{enum:[12,25,50,100]},CurrentPage:integer}}})},
  '/api/exports':{get:op('List exports for this technical client'),post:op('Prepare an archive excerpt',{status:'202',body:{type:'object',required:['recordId'],properties:{recordId:string,offset:{type:'integer',minimum:0},duration:{type:'integer',minimum:1,maximum:3600},browser:{type:'boolean'}}}})},
  '/api/exports/batch':{post:op('Prepare only explicitly selected records',{status:'202',body:{type:'object',required:['recordIds'],properties:{recordIds:{type:'array',minItems:1,maxItems:5000,items:string}}}})},
  '/api/exports/{id}':{get:op('Read progress and result metadata',{params:[id]})},
  '/api/exports/{id}/cancel':{post:op('Cancel preparation',{params:[id],body:object})},
  '/api/exports/{id}/file':{get:{...op('Download a prepared MP4, supporting byte ranges',{params:[id]}),responses:{'200':{description:'MP4',content:{'video/mp4':{schema:{type:'string',format:'binary'}}}},'206':{description:'MP4 byte range'},'409':{description:'Not ready'}}}},
  '/api/live':{post:{...op('Live concatenated JPEG images, 5 fps, without audio',{body:{type:'object',required:['channel'],properties:{channel:{type:'integer',minimum:1},stream:{enum:[0,1]}}}}),responses:{'200':{description:'Concatenated JPEG stream',content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}}}}}
 };
 return {openapi:'3.0.3',info:{title:'Noxis',version:'1.2.0',description:'Local NVR media gateway. Bearer token is server-side only. A monitor token is restricted to GET /api/status and /api/cameras.'},servers:[{url:basePath||'/'}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}},paths};
}
