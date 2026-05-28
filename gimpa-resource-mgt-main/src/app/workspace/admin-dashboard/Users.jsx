"use client";

import { useEffect, useState } from "react";

import {
getFirestore,
collection,
getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

import { IoMdSearch } from "react-icons/io";
import {
departments as gimpaDepartments,
CENTRAL_ADMIN_LABEL
} from "@/app/constants/departments";
import "@/app/styles/admin-dashboard/Users.css";

export default function Users(){

const firestore = getFirestore(app);

const [users,setUsers] = useState([]);
const [filteredUsers,setFilteredUsers] = useState([]);
const [search,setSearch] = useState("");
const [selectedDepartment,setSelectedDepartment] = useState("All");

useEffect(()=>{

const loadUsers = async()=>{

const snapshot = await getDocs(collection(firestore,"users"));

let list = [];

snapshot.forEach(doc=>{
list.push({
id:doc.id,
...doc.data()
});
});

setUsers(list);
setFilteredUsers(list);

};

loadUsers();

},[]);

useEffect(()=>{

let results = users;

// department filter
if(selectedDepartment !== "All"){

if(selectedDepartment === CENTRAL_ADMIN_LABEL){
results = results.filter(user => !user.department);
}else{
results = results.filter(user => user.department === selectedDepartment);
}

}

// search filter
if(search){

const term = search.toLowerCase();

results = results.filter(user =>

user.fullName?.toLowerCase().includes(term) ||
user.email?.toLowerCase().includes(term) ||
user.role?.toLowerCase().includes(term) ||
user.department?.toLowerCase().includes(term)

);

}

setFilteredUsers(results);

},[search,selectedDepartment,users]);

// Filter options: "All" + the canonical GIMPA departments + the
// Central Administration bucket for users with no department.
const departments = [
"All",
...gimpaDepartments,
CENTRAL_ADMIN_LABEL
];

return(

<div className="users-container">

<h2 className="users-title">User Directory</h2>

{/* Search Bar */}

<div className="users-controls">

<div className="search-bar">

<IoMdSearch className="search-icon"/>

<input
type="text"
placeholder="Search by name, email, role or department"
value={search}
onChange={(e)=>setSearch(e.target.value)}
/>

</div>

<select
value={selectedDepartment}
onChange={(e)=>setSelectedDepartment(e.target.value)}
>

{departments.map(dep=>(
<option key={dep} value={dep}>
{dep}
</option>
))}

</select>

</div>

{/* Users Table */}

<table className="users-table">

<thead>
<tr>
<th>Name</th>
<th>Email</th>
<th>Role</th>
<th>Department</th>
</tr>
</thead>

<tbody>

{filteredUsers.map(user=>(
<tr key={user.id}>

<td>{user.fullName}</td>
<td>{user.email}</td>
<td>{user.role}</td>
<td>{user.department || CENTRAL_ADMIN_LABEL}</td>

</tr>
))}

</tbody>

</table>

</div>

);

}