import { google } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_ID = '1y8dqhIyJmUbu8JupnVKR4Rd5t3vJFgx1';

function getDriveClient() {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    return google.drive({ version: 'v3', auth });
}

export async function uploadTestimonyCardToDrive(
    buffer: Buffer,
    filename: string
): Promise<void> {
    const drive = getDriveClient();

    await drive.files.create({
        requestBody: {
            name: filename,
            parents: [FOLDER_ID],
            mimeType: 'image/png',
        },
        media: {
            mimeType: 'image/png',
            body: Readable.from(buffer),
        },
    });
}
