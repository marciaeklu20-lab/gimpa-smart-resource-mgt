"use client";

import { useEffect, useState } from "react";

import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

import app from "@/firebase/config";

import { subscribeBookings } from "./services/subscribeBookings";

import BookingTable from "./BookingTable";

export default function BookingRequests({ initialFilter, initialExpandedId } = {}) {

  const auth = getAuth(app);
  const db = getFirestore(app);

  const [bookings, setBookings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {

    let unsubscribe = null;

    const loadUser = async () => {

      try {

        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;

        const userDoc = await getDoc(
          doc(db, "users", firebaseUser.uid)
        );
        if (!userDoc.exists()) return;

        const userData = {
          uid: firebaseUser.uid,
          ...userDoc.data()
        };

        setCurrentUser(userData);

        unsubscribe = subscribeBookings({
          user: userData,
          onUpdate: setBookings
        });

      } catch (error) {

        console.error(error);

      }

    };

    loadUser();

    return () => {
      if (unsubscribe) unsubscribe();
    };

  }, []);

  if (!currentUser) {
    return <p>Loading...</p>;
  }

  return (
    <BookingTable
      bookings={bookings}
      currentUser={currentUser}
      initialFilter={initialFilter}
      initialExpandedId={initialExpandedId}
    />
  );

}
