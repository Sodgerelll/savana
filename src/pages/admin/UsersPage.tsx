/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pencil } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

export default function UsersPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    directoryUsers,
    directoryError,
    userRoleCounts,
    openUserProfileModal,
    getRoleLabel,
    getAuthMethodLabel,
    getUserIdentity,
    resolveUserRole,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{language === "MN" ? "Хэрэглэгч" : "Users"}</p>
          <h1>{language === "MN" ? "Хэрэглэгчийн жагсаалт" : "User Directory"}</h1>
          <p>
            {language === "MN"
              ? "Бүртгүүлсэн хэрэглэгчдийн role, бүртгэлийн төрөл, сүүлийн нэвтрэх аргыг эндээс харна."
              : "Review registered users, their roles, registration types, and their latest authentication method."}
          </p>
        </div>
      </div>

      {directoryError && <div className="admin-sync-error">{directoryError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт хэрэглэгч" : "Total users"}</span>
          <strong>{directoryUsers.length}</strong>
          <small>{language === "MN" ? "Бүртгэлтэй хэрэглэгчдийн тоо" : "Registered user profiles"}</small>
        </div>
        <div className="admin-summary-card">
          <span>{getRoleLabel("sysadmin", language)}</span>
          <strong>{userRoleCounts.sysadmin}</strong>
          <small>{language === "MN" ? "Бүрэн эрхтэй хэрэглэгч" : "Full-access operators"}</small>
        </div>
        <div className="admin-summary-card">
          <span>{getRoleLabel("admin", language)}</span>
          <strong>{userRoleCounts.admin}</strong>
          <small>{language === "MN" ? "Админ эрхтэй хэрэглэгч" : "Admin operators"}</small>
        </div>
        <div className="admin-summary-card">
          <span>{getRoleLabel("worker", language)}</span>
          <strong>{userRoleCounts.worker}</strong>
          <small>{language === "MN" ? "Ажилтны эрхтэй хэрэглэгч" : "Employee accounts"}</small>
        </div>
        <div className="admin-summary-card">
          <span>{getRoleLabel("customer", language)}</span>
          <strong>{userRoleCounts.customer}</strong>
          <small>{language === "MN" ? "Энгийн бүртгэлтэй хэрэглэгч" : "Standard registered users"}</small>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{language === "MN" ? "Хэрэглэгчид" : "Users"}</h2>
            <p>
              {language === "MN"
                ? "Registration method болон last auth method-оор ялгаж харуулна."
                : "Grouped by registration method and latest authentication method."}
            </p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{language === "MN" ? "Хэрэглэгч" : "User"}</th>
                <th>{language === "MN" ? "Role" : "Role"}</th>
                <th>{language === "MN" ? "Бүртгэсэн төрөл" : "Registered Via"}</th>
                <th>{language === "MN" ? "Сүүлийн нэвтрэлт" : "Last Auth"}</th>
                <th>{language === "MN" ? "Холбоо барих" : "Contact"}</th>
                <th className="admin-table-sticky-action">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {directoryUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {language === "MN" ? "Хэрэглэгч олдсонгүй." : "No user profiles found."}
                  </td>
                </tr>
              ) : (
                directoryUsers.map((directoryUser: any) => {
                  const resolvedRole = resolveUserRole(directoryUser);

                  return (
                    <tr key={directoryUser.uid}>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{getUserIdentity(directoryUser)}</strong>
                          <small>{directoryUser.uid}</small>
                        </div>
                      </td>
                      <td>{getRoleLabel(resolvedRole, language)}</td>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{getAuthMethodLabel(directoryUser.registrationMethod, language)}</strong>
                          <small>
                            {directoryUser.registrationMethod === "phone" && directoryUser.hasPassword
                              ? language === "MN"
                                ? "password-той phone account"
                                : "phone account with password"
                              : directoryUser.hasPassword
                                ? language === "MN"
                                  ? "password идэвхтэй"
                                  : "password enabled"
                                : language === "MN"
                                  ? "password ашиглахгүй"
                                  : "no password"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{getAuthMethodLabel(directoryUser.lastAuthMethod, language)}</strong>
                          <small>
                            {directoryUser.lastSignInAt
                              ? new Date(directoryUser.lastSignInAt).toLocaleString(language === "MN" ? "mn-MN" : "en-US")
                              : "-"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{directoryUser.phoneNumber ?? directoryUser.email ?? "-"}</strong>
                          <small>{directoryUser.email ?? directoryUser.phoneLoginEmail ?? "-"}</small>
                        </div>
                      </td>
                      <td className="admin-table-sticky-action">
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => openUserProfileModal(directoryUser)}
                            title={copy.editUser}
                            aria-label={`${copy.editUser} ${getUserIdentity(directoryUser)}`}
                          >
                            <Pencil size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
