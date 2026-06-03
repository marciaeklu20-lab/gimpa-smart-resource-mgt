
"use client";

import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import app from "@/firebase/config";

import { subscribeBookings } from "@/app/workspace/resource-management/services/subscribeBookings";
import { isUnread } from "@/app/workspace/resource-management/services/isUnread";

import { PLATFORM_ADMINS, MAINTENANCE_ROLES } from "@/app/lib/roles";

import { MdOutlineDashboard, MdNotificationsActive } from "react-icons/md";
import { BsMenuButtonWide, BsMenuButtonWideFill, BsChatLeftDots } from "react-icons/bs";
import { FaRobot, FaTools } from "react-icons/fa";
import { GrResources } from "react-icons/gr";
import { RiAdminLine } from "react-icons/ri";

import "@/app/styles/components/sidebar.css";

export default function Sidebar({ collapsed, setCollapsed, activeTab, setActiveTab }) {

  const [role, setRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [notifPermission, setNotifPermission] = useState("default");

  // Skips the first snapshot (existing-data load) so admins don't get
  // flooded with notifications for users who signed up before this
  // session started.
  const isFirstSnapshot = useRef(true);

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  useEffect(() => {
    const fetchUserData = async () => {

      const user = auth.currentUser;

      if (!user) return;

      const userDoc = await getDoc(doc(firestore, "users", user.uid));

      if (userDoc.exists()) {
        const userData = { uid: user.uid, ...userDoc.data() };
        setCurrentUser(userData);
        setRole(userData.role);
      }

    };

    fetchUserData();

  }, []);

  // Live subscription to bookings the current user can see (any role,
  // including non-admin requesters). Drives the unread-message badge
  // on the Resource Management nav item — count is computed below
  // from `bookings` + isUnread().
  useEffect(() => {

    if (!currentUser?.role) {
      setBookings([]);
      return;
    }

    const unsubscribe = subscribeBookings({
      user: currentUser,
      onUpdate: setBookings
    });

    return unsubscribe;

  }, [currentUser?.uid, currentUser?.role]);

  // Read the browser's current permission state on mount so the
  // "enable notifications" button reflects reality across reloads.
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Live count of users awaiting admin approval + desktop notifications
  // for new signups. Subscribed only for admin-level viewers; torn down
  // on unmount or role change.
  useEffect(() => {

    if (!role || !PLATFORM_ADMINS.includes(role)) {
      setPendingCount(0);
      return;
    }

    isFirstSnapshot.current = true;

    const q = query(
      collection(firestore, "users"),
      where("needsApproval", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      setPendingCount(snapshot.size);

      // Skip the initial existing-data load.
      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false;
        return;
      }

      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;

        const data = change.doc.data();
        const userName = data.fullName || data.email || "A user";
        const userRoleName = data.role || "unknown role";
        const userId = change.doc.id;

        // tag dedupes — same userId won't notify twice in one session.
        const notification = new Notification("New approval request", {
          body: `${userName} (${userRoleName}) signed up and is awaiting approval`,
          icon: "/images/gimpa-logo.png",
          tag: `pending-user-${userId}`
        });

        notification.onclick = () => {
          window.focus();
          // No /workspace/admin-dashboard route exists — workspace tabs
          // are state-driven, and Sidebar owns that state via the
          // setActiveTab prop, so we just switch in place.
          setActiveTab("Admin Dashboard");
        };
      });
    });

    return unsubscribe;

  }, [role]);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === "granted") {
      try {
        localStorage.setItem("grm:notifications-granted", "1");
      } catch (e) {
        // localStorage may be disabled (private mode etc.) — non-fatal.
      }
    }
  };

  const showNotifPrompt =
    role &&
    PLATFORM_ADMINS.includes(role) &&
    notifPermission === "default";

  const unreadBookingCount = bookings.filter(
    (b) => isUnread(b, currentUser)
  ).length;

  const features = [
    { name: "Dashboard", icon: <MdOutlineDashboard size={20} /> },
    { name: "Resource Management", icon: <GrResources size={20} /> },
    { name: "Chat", icon: <BsChatLeftDots size={20} /> },

    // Maintenance visible only to super_admin + Maintenance Staff.
    ...(MAINTENANCE_ROLES.includes(role)
      ? [{ name: "Maintenance", icon: <FaTools size={20} /> }]
      : []),

    { name: "Analytics", icon: <BsMenuButtonWide size={20} /> },
    { name: "AI Assistant", icon: <FaRobot size={20} /> },

    // Admin Dashboard visible only to platform admins.
    ...(PLATFORM_ADMINS.includes(role)
      ? [{ name: "Admin Dashboard", icon: <RiAdminLine size={20} /> }]
      : []),
  ];

  return (
    <aside className={`sidebar-container ${collapsed ? "collapsed" : ""}`}>

      {/* Toggle button */}
      <div
        className="sidebar-toggle-btn"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed
          ? <BsMenuButtonWide size={24} />
          : <BsMenuButtonWideFill size={24} />}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">

        {features.map((feature) => (

          <div
            key={feature.name}
            className={`sidebar-item ${activeTab === feature.name ? "active" : ""}`}
            onClick={() => setActiveTab(feature.name)}
          >

            <span className="sidebar-icon">{feature.icon}</span>

            {!collapsed && (
              <span className="sidebar-text">{feature.name}</span>
            )}

            {feature.name === "Admin Dashboard" && pendingCount > 0 && (
              <span className="sidebar-badge">{pendingCount}</span>
            )}

            {/* Unread booking-chat count. Sidebar has no "Bookings"
               item — Bookings is a sub-tab under Resource Management
               — so the badge surfaces here, mirroring the Admin
               Dashboard pendingCount pattern. */}
            {feature.name === "Resource Management" && unreadBookingCount > 0 && (
              <span className="sidebar-badge">{unreadBookingCount}</span>
            )}

          </div>

        ))}

      </nav>

      {showNotifPrompt && (
        <button
          type="button"
          className="sidebar-notif-btn"
          onClick={requestNotificationPermission}
          title="Enable desktop notifications"
        >
          <span className="sidebar-notif-btn-icon">
            <MdNotificationsActive size={18} />
          </span>
          {!collapsed && (
            <span className="sidebar-notif-btn-text">
              Enable desktop notifications
            </span>
          )}
        </button>
      )}

    </aside>
  );
}