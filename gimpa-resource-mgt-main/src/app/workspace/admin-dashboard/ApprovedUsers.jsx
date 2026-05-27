"use client";

import { useEffect, useState } from "react";

import {
getFirestore,
collection,
query,
where,
getDocs
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import app from "@/firebase/config";

export default function ApprovedUsers(){

const firestore = getFirestore(app);
const auth = getAuth(app);

const [approvedUsers,setApprovedUsers] = useState([]);

// roles that require approval
const approvalRoles = [
"IT Officer",
"Secretariat Admin",
"Course Rep",
"Lecturer",
"Teaching Assistant",
"Maintenance Officer",
"Stores/Inventory Officer",
"Facility/Estate Officer",
"Procurement Officer"
];

const loadApprovedUsers = async(userRole,userDepartment)=>{

const q = query(
collection(firestore,"users"),
where("approved","==",true)
);

const snapshot = await getDocs(q);

let users = [];

snapshot.forEach(docSnap=>{
users.push({
id:docSnap.id,
...docSnap.data()
});
});

// only keep roles that required approval
users = users.filter(user => approvalRoles.includes(user.role));

// Secretariat Admin sees only their department
if(userRole === "Secretariat Admin"){
users = users.filter(user => user.department === userDepartment);
}

setApprovedUsers(users);

};

useEffect(()=>{

const loadCurrentUser = async()=>{

const currentUser = auth.currentUser;

if(!currentUser) return;

const q = query(
collection(firestore,"users"),
where("email","==",currentUser.email)
);

const snapshot = await getDocs(q);

snapshot.forEach(docSnap=>{

const data = docSnap.data();

const role = data.role;
const department = data.department;

loadApprovedUsers(role,department);

});

};

loadCurrentUser();

},[]);

return(

<div className="approvals-container">

<h2 className="approvals-title">
Approved System Users
</h2>

{approvedUsers.length===0&&(
<p className="no-requests">
No approved users found.
</p>
)}

{approvedUsers.length>0&&(

<table className="approvals-table">

<thead>
<tr>
<th>Name</th>
<th>Email</th>
<th>Role</th>
<th>Department</th>
</tr>
</thead>

<tbody>

{approvedUsers.map(user=>(

<tr key={user.id}>

<td>{user.fullName}</td>
<td>{user.email}</td>
<td>{user.role}</td>
<td>{user.department || "N/A"}</td>

</tr>

))}

</tbody>

</table>

)}

</div>

);

}