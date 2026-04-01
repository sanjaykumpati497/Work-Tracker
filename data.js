const users = [
{
username:"sanjaykumpati",
password:"Sanjay@123",
role:"admin"
},
{
username:"member1",
password:"123",
role:"member"
},
{
username:"member2",
password:"123",
role:"member"
}
];

if(!localStorage.getItem("tasks")){
localStorage.setItem("tasks",JSON.stringify([]));
}