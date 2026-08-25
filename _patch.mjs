import { readFileSync, writeFileSync } from 'node:fs';

function edit(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.split('\r\n').join('\n');
  for (const [from, to] of pairs) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected 1, found ${count} for:\n${from.slice(0, 110)}`);
    text = text.replace(from, to);
  }
  writeFileSync(file, crlf ? text.split('\n').join('\r\n') : text);
  console.log('patched', file);
}

edit('src/pages/admin/ChatSettingsPage.tsx', [
  [
`      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>
              <Link2 size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {copy.connSection}`,
`      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.menuSection}</h2>
            <p>{copy.quickRepliesHelp}</p>
          </div>
        </div>

        <div className="admin-field admin-field-wide">
          <span>{copy.menuButtons}</span>
          <ButtonListEditor
            buttons={draft.menuButtons}
            language={language}
            addLabel={copy.addButton}
            onChange={(menuButtons) => patch({ menuButtons })}
          />
          <small>{copy.menuHelp}</small>
        </div>

        <div className="admin-field admin-field-wide">
          <span>{copy.quickReplies}</span>
          <ButtonListEditor
            buttons={draft.quickReplies}
            language={language}
            addLabel={copy.addButton}
            onChange={(quickReplies) => patch({ quickReplies })}
          />
          <small>{copy.quickRepliesHelp}</small>
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>
              <Link2 size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {copy.connSection}`,
  ],
]);
