/** Private compressed source-response retention in Google Drive. */

function aqRawRootFolder_() {
  const properties = aqProperties_();
  const configured = properties.getProperty('RAW_FOLDER_ID');
  if (configured) return DriveApp.getFolderById(configured);

  const spreadsheetFile = DriveApp.getFileById(aqSpreadsheet_().getId());
  const parents = spreadsheetFile.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const name = 'Air Quality Source Archive (Private)';
  const existing = parent.getFoldersByName(name);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(name);
  properties.setProperty('RAW_FOLDER_ID', folder.getId());
  return folder;
}

function aqChildFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function aqArchiveRaw_(source, dateText, filename, contents, mimeType) {
  if (!aqConfig_().keepRaw) return '';
  const root = aqRawRootFolder_();
  const sourceFolder = aqChildFolder_(root, source);
  const yearFolder = aqChildFolder_(sourceFolder, dateText.slice(0, 4));
  const monthFolder = aqChildFolder_(yearFolder, dateText.slice(5, 7));
  const gzipName = filename + '.gz';
  const blob = Utilities.newBlob(contents, mimeType || 'application/octet-stream', filename);
  const zipped = Utilities.gzip(blob).setName(gzipName);
  const matches = monthFolder.getFilesByName(gzipName);
  if (matches.hasNext()) {
    const file = matches.next();
    file.setTrashed(true);
  }
  return monthFolder.createFile(zipped).getId();
}
