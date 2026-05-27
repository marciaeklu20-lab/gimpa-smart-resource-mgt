"use client";

import {
  useEffect,
  useState
} from "react";

import {
  getAuth
} from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  fetchBookings
} from "./services/fetchBookings";

import BookingTable from "./BookingTable";

export default function BookingRequests() {

  const auth = getAuth(app);

  const db = getFirestore(app);

  const [bookings, setBookings] =
    useState([]);

  const [currentUser, setCurrentUser] =
    useState(null);

  const loadBookings = async (
    userData
  ) => {

    const data =
      await fetchBookings(
        userData
      );

    setBookings(data);

  };

  useEffect(() => {

    const loadUser = async () => {

      try {

        const firebaseUser =
          auth.currentUser;

        if (!firebaseUser) {
          return;
        }

        const userDoc =
          await getDoc(
            doc(
              db,
              "users",
              firebaseUser.uid
            )
          );

        if (!userDoc.exists()) {
          return;
        }

        const userData = {

          uid: firebaseUser.uid,

          ...userDoc.data()

        };

        setCurrentUser(userData);

        await loadBookings(userData);

      } catch (error) {

        console.error(error);

      }

    };

    loadUser();

  }, []);

  if (!currentUser) {
    return <p>Loading...</p>;
  }

  return (

    <BookingTable
      bookings={bookings}
      currentUser={currentUser}
      refreshBookings={() =>
        loadBookings(currentUser)
      }
    />

  );

}