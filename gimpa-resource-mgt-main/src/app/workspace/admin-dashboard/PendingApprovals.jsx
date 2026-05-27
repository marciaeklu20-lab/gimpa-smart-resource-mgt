"use client";

import { useEffect,useState } from "react";

import {
getFirestore,
collection,
query,
where,
getDocs,
doc,
updateDoc,
deleteDoc
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import app from "@/firebase/config";

export default function PendingApprovals(){

const firestore=getFirestore(app);
const auth=getAuth(app);

const [pendingUsers,setPendingUsers]=useState([]);
const [adminRole,setAdminRole]=useState(null);

const facultyRoles=[
"Course Rep",
"Lecturer",
"Teaching Assistant",
"Secretariat Admin"
];

const loadPendingUsers=async(role)=>{

const q=query(
collection(firestore,"users"),
where("needsApproval","==",true)
);

const snapshot=await getDocs(q);

let users=[];

snapshot.forEach(docSnap=>{
users.push({
id:docSnap.id,
...docSnap.data()
});
});

if(role==="Secretariat Admin"){
users=users.filter(user=>facultyRoles.includes(user.role));
}

if(role==="IT Officer"){
users=users.filter(user=>!facultyRoles.includes(user.role));
}

setPendingUsers(users);

};

useEffect(()=>{

const loadAdminRole=async()=>{

const user=auth.currentUser;

if(!user)return;

const q=query(
collection(firestore,"users"),
where("email","==",user.email)
);

const snapshot=await getDocs(q);

snapshot.forEach(docSnap=>{

const role=docSnap.data().role;

setAdminRole(role);

loadPendingUsers(role);

});

};

loadAdminRole();

},[]);

const approveUser=async(id)=>{

const userRef=doc(firestore,"users",id);

await updateDoc(userRef,{
approved:true,
needsApproval:false
});

setPendingUsers(prev=>prev.filter(user=>user.id!==id));

};

const denyUser=async(id)=>{

const userRef=doc(firestore,"users",id);

await deleteDoc(userRef);

setPendingUsers(prev=>prev.filter(user=>user.id!==id));

};

return(

<div>

<h2 className="approvals-title">
Users Waiting For Approval
</h2>

{pendingUsers.length===0&&(
<p className="no-requests">
No users are waiting for approval.
</p>
)}

{pendingUsers.length>0&&(

<table className="approvals-table">

<thead>
<tr>
<th>Name</th>
<th>Email</th>
<th>Role</th>
<th>Department</th>
<th>Action</th>
</tr>
</thead>

<tbody>

{pendingUsers.map(user=>(

<tr key={user.id}>

<td>{user.fullName}</td>
<td>{user.email}</td>
<td>{user.role}</td>
<td>{user.department||"N/A"}</td>

<td className="action-buttons">

<button
className="approve-btn"
onClick={()=>approveUser(user.id)}
>
Approve
</button>

<button
className="deny-btn"
onClick={()=>denyUser(user.id)}
>
Deny
</button>

</td>

</tr>

))}

</tbody>

</table>

)}

</div>

);

}