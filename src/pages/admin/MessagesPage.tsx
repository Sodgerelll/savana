/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AdminCtx } from "./adminShellTypes";

export default function MessagesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    contactMessages,
    contactMessagesError,
    contactMessagesLast7DaysCount,
    latestContactMessageAt,
    formatAdminDateTime,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.messagesMenu}</p>
          <h1>{copy.messagesTitle}</h1>
          <p>{copy.messagesText}</p>
        </div>
      </div>

      {contactMessagesError && <div className="admin-sync-error">{contactMessagesError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.totalMessages}</span>
          <strong>{contactMessages.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.messagesLast7Days}</span>
          <strong>{contactMessagesLast7DaysCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.latestReceived}</span>
          <strong>{formatAdminDateTime(latestContactMessageAt, language)}</strong>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.messagesMenu}</h2>
            <p>{copy.messagesListHelp}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table admin-messages-table">
            <thead>
              <tr>
                <th>{copy.receivedAt}</th>
                <th>{copy.senderName}</th>
                <th>{copy.senderEmail}</th>
                <th>{copy.messageSubject}</th>
                <th>{copy.messageBody}</th>
              </tr>
            </thead>
            <tbody>
              {contactMessages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    {copy.emptyMessages}
                  </td>
                </tr>
              ) : (
                contactMessages.map((contactMessage: any) => (
                  <tr key={contactMessage.id}>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(contactMessage.createdAt, language)}</strong>
                        <small>#{contactMessage.id.slice(0, 6).toUpperCase()}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{contactMessage.name}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <a className="admin-contact-email-link" href={`mailto:${contactMessage.email}`}>
                          {contactMessage.email}
                        </a>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{contactMessage.subject}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap admin-contact-message-cell">
                        <p className="admin-contact-message-text">{contactMessage.message}</p>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
