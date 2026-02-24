"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Legacy chat page — redirects to the unified inbox.
 * All chat now happens in /dashboard/inbox.
 */
export default function EmployeeChatRedirect() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;

  useEffect(() => {
    router.replace(`/dashboard/inbox?employee=${employeeId}`);
  }, [router, employeeId]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "2px solid #e5e5e5",
          borderTopColor: "#a3a3a3",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
