const fs = require('fs');
const ref = n => ({$ref:'#/components/schemas/'+n});
const str = {type:'string'};
const num = {type:['number','null'],minimum:0};
const obj = (properties,required=Object.keys(properties))=>({type:'object',properties,required});
const arr = n=>({type:'array',items:ref(n)});
const schemas = {
 HealthStatus:obj({status:str}),
 Setting:obj({id:str,kind:{type:'string',enum:['material','machine','product','reason','unit']},name:str,active:{type:'boolean'}}),
 SettingInput:obj({kind:{type:'string',enum:['material','machine','product','reason','unit']},name:{type:'string',minLength:1},active:{type:'boolean'}},['kind','name']),
 Company:obj({id:str,name:str,role:str,tolerance:{type:'number'},settings:arr('Setting')}),
 CompanyInput:obj({name:{type:'string',minLength:1},unit:{type:'string',enum:['kg','sheets','m']},loadSamples:{type:'boolean'}},['name','unit']),
 CompanyUpdate:obj({name:{type:'string',minLength:1},tolerance:{type:'number',minimum:0}},['name','tolerance']),
 Member:obj({id:str,userId:{type:['string','null']},name:str,role:str,inviteCode:{type:['string','null']}}),
 MemberInput:obj({name:{type:'string',minLength:1},role:{type:'string',enum:['operator','supervisor','manager','admin']}}),
 JoinInput:obj({code:{type:'string',minLength:1}}),
 Scrap:obj({reason:str,quantity:num}),
 JobInput:obj({number:{type:'string',minLength:1},date:str,material:str,machine:str,product:str,unit:str,instructions:str,issued:num,good:num,offcuts:num,scrap:arr('Scrap'),notes:str,plannedYield:{type:['number','null'],minimum:0,maximum:100},unsupported:{type:'boolean'},version:{type:'integer'}},['number','date','material','machine','product','unit','instructions','issued','good','offcuts','scrap','notes','unsupported']),
 Audit:obj({id:str,actor:str,action:str,at:str,comment:str,changes:str}),
 Job:obj({id:str,companyId:str,number:str,date:str,material:str,machine:str,product:str,unit:str,instructions:str,issued:num,good:num,offcuts:num,scrap:arr('Scrap'),notes:str,plannedYield:{type:['number','null']},unsupported:{type:'boolean'},version:{type:'integer'},status:{type:'string',enum:['draft','submitted','approved','returned']},createdBy:str,createdAt:str,updatedAt:str,isSample:{type:'boolean'},scrapTotal:{type:'number'},difference:{type:'number'},yieldRate:{type:'number'},scrapRate:{type:'number'},offcutRate:{type:'number'},audit:arr('Audit')}),
 ActionInput:obj({action:{type:'string',enum:['submit','approve','return','reopen']},comment:str,version:{type:'integer'}},['action','version']),
 Summary:obj({jobs:{type:'integer'},pending:{type:'integer'},approved:{type:'integer'},drafts:{type:'integer'},units:{type:'array',items:obj({unit:str,issued:{type:'number'},good:{type:'number'},scrap:{type:'number'},offcuts:{type:'number'},yieldRate:{type:'number'}})},categories:{type:'array',items:obj({reason:str,unit:str,quantity:{type:'number'}})}}),
};
const paths={};
const phase2Fields={
 sheetWidthMm:num,sheetLengthMm:num,assignedTo:{type:['string','null']},
 offcutSizeNote:str,offcutLocation:str,pendingRework:num
};
Object.assign(schemas.JobInput.properties,phase2Fields);
schemas.Summary.properties.units.items.properties.pendingRework={type:'number'};
Object.assign(schemas.Job.properties,phase2Fields,{
 assignedName:str,recordingVersion:{type:'integer'},reworkResolved:{type:'number'}
});
schemas.Assignee=obj({userId:str,name:str,role:str});
schemas.ReworkInput=obj({version:{type:'integer'},good:{type:'number',minimum:0},offcuts:{type:'number',minimum:0},scrap:arr('Scrap'),comment:{type:'string',minLength:1}});
function endpoint(path,method,id,response,body,params=[]){
 const op={operationId:id,parameters:params.map(n=>({name:n,in:'path',required:true,schema:str})),responses:{'200':{description:'Success',content:{'application/json':{schema:response}}}}};
 if(body)op.requestBody={required:true,content:{'application/json':{schema:ref(body)}}};
 (paths[path]??={})[method]=op;
}
endpoint('/healthz','get','healthCheck',ref('HealthStatus'));
endpoint('/companies','get','listCompanies',arr('Company'));
endpoint('/companies','post','createCompany',ref('Company'),'CompanyInput');
endpoint('/companies/join','post','joinCompany',ref('Company'),'JoinInput');
endpoint('/companies/{companyId}','patch','updateCompany',ref('Company'),'CompanyUpdate',['companyId']);
endpoint('/companies/{companyId}/settings','post','addSetting',ref('Setting'),'SettingInput',['companyId']);
endpoint('/companies/{companyId}/settings/{settingId}','patch','updateSetting',ref('Setting'),'SettingInput',['companyId','settingId']);
endpoint('/companies/{companyId}/members','get','listMembers',arr('Member'),null,['companyId']);
endpoint('/companies/{companyId}/members','post','inviteMember',ref('Member'),'MemberInput',['companyId']);
endpoint('/companies/{companyId}/members/{memberId}','patch','updateMember',ref('Member'),'MemberInput',['companyId','memberId']);
endpoint('/companies/{companyId}/jobs','get','listJobs',arr('Job'),null,['companyId']);
endpoint('/companies/{companyId}/jobs','post','createJob',ref('Job'),'JobInput',['companyId']);
endpoint('/companies/{companyId}/jobs/{jobId}','get','getJob',ref('Job'),null,['companyId','jobId']);
endpoint('/companies/{companyId}/jobs/{jobId}','patch','updateJob',ref('Job'),'JobInput',['companyId','jobId']);
endpoint('/companies/{companyId}/jobs/{jobId}/actions','post','transitionJob',ref('Job'),'ActionInput',['companyId','jobId']);
endpoint('/companies/{companyId}/summary','get','getSummary',ref('Summary'),null,['companyId']);
endpoint('/demo/jobs','get','getDemoJobs',arr('Job'));
endpoint('/companies/{companyId}/assignees','get','listAssignees',arr('Assignee'),null,['companyId']);
endpoint('/companies/{companyId}/jobs/{jobId}/rework','post','resolveRework',ref('Job'),'ReworkInput',['companyId','jobId']);
const text=fs.readFileSync('.local/skills/replit-auth/references/openapi.md','utf8');
// Preserve supplied auth specification blocks as YAML alongside JSON-compatible YAML.
const blocks=[...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map(m=>m[1]);
const yaml=require('yaml');
const authPaths=yaml.parse(blocks[1]),parameters=yaml.parse(blocks[2]),authSchemas=yaml.parse(blocks[3]);
fs.writeFileSync('lib/api-spec/openapi.yaml',JSON.stringify({openapi:'3.1.0',info:{title:'Api',version:'1.0.0'},servers:[{url:'/api'}],paths:{...paths,...authPaths},components:{parameters,schemas:{...schemas,...authSchemas}}},null,2));
