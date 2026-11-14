import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { createApp, RazorpayClientLike } from '../server';
import { ServerDataStore } from './store';
import { setCustomTokenVerifierForTests, getExpectedKioskSecret } from './auth';

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQzwAEjDAGACfRAwV4a06ZAAAAAElFTkSuQmCC';

async function createSamplePdfBuffer(pageCount: number, blankIndices: number[] = []): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    if (!blankIndices.includes(i)) {
      page.drawText(`Sample PDF Page ${i + 1}`, { x: 50, y: 760, size: 16 });
    }
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSampleDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createSampleXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Item', 'Qty', 'Price'],
    ['Paper A4', 500, 250],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function createSamplePptxBuffer(slideText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${slideText}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('End-to-end Print Point backend: auth, QR session, file conversion, tamper-proof pricing, Razorpay/wallet, kiosk fulfillment & refund', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printpoint-e2e-'));
  const prevRzpKeyId = process.env.RAZORPAY_KEY_ID;
  const prevRzpSecret = process.env.RAZORPAY_KEY_SECRET;
  const prevWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  process.env.RAZORPAY_KEY_ID = 'rzp_test_printpoint';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_printpoint_123';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_printpoint_456';

  let orderCounter = 0;
  const mockRzp: RazorpayClientLike = {
    orders: {
      async create(params) {
        orderCounter++;
        return {
          id: `order_mock_${orderCounter}`,
          amount: params.amount,
          currency: params.currency,
          status: 'created',
        };
      },
      async fetchPayments(orderId) {
        return {
          items: [
            {
              id: `pay_fetched_${orderId}`,
              status: 'captured',
              amount: 10000,
              method: 'upi',
            },
          ],
        };
      },
    },
  };

  setCustomTokenVerifierForTests(async (token: string) => {
    if (token === 'token-alice') {
      return { uid: 'uid-alice', email: 'alice@example.com', name: 'Alice', emailVerified: true };
    }
    if (token === 'token-bob') {
      return { uid: 'uid-bob', email: 'bob@example.com', name: 'Bob', emailVerified: true };
    }
    throw new Error('Invalid test Firebase ID token.');
  });

  const store = new ServerDataStore(tmpDir);
  const { app } = createApp({ store, razorpayClient: mockRzp });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const kioskSecret = getExpectedKioskSecret();

  try {
    // 1. Unauthenticated endpoints reject cleanly with 401
    for (const ep of [
      { method: 'GET', url: '/api/wallet' },
      { method: 'GET', url: '/api/orders' },
      { method: 'POST', url: '/api/kiosk/sessions/validate' },
      { method: 'POST', url: '/api/payments/create-order' },
      { method: 'POST', url: '/api/wallet/debit-and-print' },
    ]) {
      const r = await fetch(`${baseUrl}${ep.url}`, { method: ep.method });
      assert.equal(r.status, 401, `${ep.method} ${ep.url} must return 401 without Bearer token`);
    }

    // 2. Hardware kiosk QR issuing & single-use pairing
    const badKioskReq = await fetch(`${baseUrl}/api/kiosk/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': 'wrong-secret' },
      body: JSON.stringify({ stationId: 'kiosk-04' }),
    });
    assert.equal(badKioskReq.status, 401);

    const issueRes = await fetch(`${baseUrl}/api/kiosk/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': kioskSecret },
      body: JSON.stringify({ stationId: 'kiosk-04', ttlMs: 15 * 60 * 1000 }),
    });
    assert.equal(issueRes.status, 201);
    const issued = (await issueRes.json()) as {
      session: { token: string; stationId: string };
      qrPayload: string;
    };

    const pairAlice = await fetch(`${baseUrl}/api/kiosk/sessions/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({ qrPayload: issued.qrPayload }),
    });
    assert.equal(pairAlice.status, 200);
    const pairJson = (await pairAlice.json()) as { valid: boolean; session: { token: string } };
    assert.equal(pairJson.valid, true);

    // Replay / steal attempt by Bob fails with 409
    const replayBob = await fetch(`${baseUrl}/api/kiosk/sessions/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-bob' },
      body: JSON.stringify({ qrPayload: issued.qrPayload }),
    });
    assert.equal(replayBob.status, 409);

    // 3. Initial wallet must be 0 & overdraft blocked
    const walletInitRes = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Authorization: 'Bearer token-alice' },
    });
    const walletInit = (await walletInitRes.json()) as { balanceInr: number };
    assert.equal(walletInit.balanceInr, 0);

    // 4. Upload PDF (3 pages, page 2 is blank), Unicode TXT (Hindi + Gujarati), DOCX, XLSX, PPTX, PNG
    async function uploadFile(name: string, buf: Buffer, mime: string, docId: string) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), name);
      form.append('docId', docId);
      form.append('stationId', 'kiosk-04');
      form.append('sessionToken', issued.session.token);
      return fetch(`${baseUrl}/api/documents/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-alice' },
        body: form,
      });
    }

    // Invalid magic bytes rejected
    const fakePdfRes = await uploadFile('fake.pdf', Buffer.from('NOT_A_PDF'), 'application/pdf', 'doc-fake');
    assert.equal(fakePdfRes.status, 400);

    const pdfBuf = await createSamplePdfBuffer(3, [1]); // 3 pages, page index 1 (page 2) is blank
    const upPdf = await uploadFile('report.pdf', pdfBuf, 'application/pdf', 'doc-pdf');
    assert.equal(upPdf.status, 201);
    const upPdfJson = (await upPdf.json()) as { docId: string; pageCount: number; blankPages: number[]; convertedPdfUrl: string };
    assert.equal(upPdfJson.pageCount, 3);
    assert.deepEqual(upPdfJson.blankPages, [2]);

    const upTxt = await uploadFile(
      'unicode.txt',
      Buffer.from('Print Point Receipt\nनमस्ते दुनिया\nનમસ્તે પ્રિન્ટ પોઇન્ટ', 'utf8'),
      'text/plain',
      'doc-txt'
    );
    assert.equal(upTxt.status, 201);

    const upDocx = await uploadFile('notes.docx', await createSampleDocxBuffer('Hello DOCX World'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc-docx');
    assert.equal(upDocx.status, 201);

    const upXlsx = await uploadFile('sheet.xlsx', createSampleXlsxBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'doc-xlsx');
    assert.equal(upXlsx.status, 201);

    const upPptx = await uploadFile('deck.pptx', await createSamplePptxBuffer('Slide One Title'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'doc-pptx');
    assert.equal(upPptx.status, 201);

    const upPng = await uploadFile('diagram.png', Buffer.from(VALID_PNG_BASE64, 'base64'), 'image/png', 'doc-png');
    assert.equal(upPng.status, 201);

    // Cross-user document isolation check
    const bobPdfAttempt = await fetch(`${baseUrl}/api/documents/doc-pdf/pdf`, {
      headers: { Authorization: 'Bearer token-bob' },
    });
    assert.equal(bobPdfAttempt.status, 404);

    // Edit uploaded PDF via PUT /api/documents/:docId/pdf (e.g. simulate editor saving 4-page PDF, then revert to 3)
    const editedForm = new FormData();
    const edited4Buf = await createSamplePdfBuffer(4, [2]);
    editedForm.append('file', new Blob([new Uint8Array(edited4Buf)], { type: 'application/pdf' }), 'report.pdf');
    const putEdit = await fetch(`${baseUrl}/api/documents/doc-pdf/pdf`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token-alice' },
      body: editedForm,
    });
    assert.equal(putEdit.status, 200);
    const putEditJson = (await putEdit.json()) as { pageCount: number };
    assert.equal(putEditJson.pageCount, 4);

    // 5. Authoritative server pricing & tamper resistance
    const quoteRes = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        stationId: 'kiosk-04',
        sessionToken: issued.session.token,
        items: [
          { docId: 'doc-pdf', name: 'report.pdf', copies: 2, colourMode: 'bw', sides: '1-sided', removeBlankPages: false },
        ],
      }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteJson = (await quoteRes.json()) as { verifiedTotalInr: number };
    assert.equal(quoteJson.verifiedTotalInr, 8); // 4 pages * ₹1 * 2 copies = ₹8

    // Overdraft rejection on wallet debit
    const overdraftRes = await fetch(`${baseUrl}/api/wallet/debit-and-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        idempotencyKey: 'key-overdraft-1',
        stationId: 'kiosk-04',
        sessionToken: issued.session.token,
        items: [{ docId: 'doc-pdf', name: 'report.pdf', copies: 2, colourMode: 'bw', sides: '1-sided', removeBlankPages: false }],
      }),
    });
    assert.equal(overdraftRes.status, 400);

    // 6. Wallet top-up via Razorpay order + HMAC verification + webhook idempotency
    const topupOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({ idempotencyKey: 'topup-key-1', amountInr: 100, purpose: 'wallet_topup', preferredMethod: 'upi' }),
    });
    assert.equal(topupOrderRes.status, 201);
    const topupOrder = (await topupOrderRes.json()) as { orderId: string; amountPaise: number };
    assert.equal(topupOrder.amountPaise, 10000);

    const paymentId = 'pay_alice_100';
    const validSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${topupOrder.orderId}|${paymentId}`)
      .digest('hex');

    const verifyTopup = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        razorpay_order_id: topupOrder.orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig,
      }),
    });
    assert.equal(verifyTopup.status, 200);
    const verifyJson = (await verifyTopup.json()) as { verified: boolean; newBalanceInr: number };
    assert.equal(verifyJson.verified, true);
    assert.equal(verifyJson.newBalanceInr, 100);

    // Webhook replay with valid rawBody HMAC must not double-credit ₹100
    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: topupOrder.orderId, method: 'upi' } } },
    });
    const webhookSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(webhookPayload)
      .digest('hex');

    const whBad = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'deadbeef' },
      body: webhookPayload,
    });
    assert.equal(whBad.status, 400);

    const whGood = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': webhookSig },
      body: webhookPayload,
    });
    assert.equal(whGood.status, 200);

    const walletAfterWh = (await (
      await fetch(`${baseUrl}/api/wallet`, { headers: { Authorization: 'Bearer token-alice' } })
    ).json()) as { balanceInr: number };
    assert.equal(walletAfterWh.balanceInr, 100);

    // 7. Atomic wallet debit & queued print job + blank page stripping + PIN claim + temp PDF cleanup
    // Re-upload clean 3-page PDF with page 2 blank so blank stripping reduces 3 -> 2 pages
    const cleanPdfRes = await uploadFile('clean3.pdf', pdfBuf, 'application/pdf', 'doc-clean3');
    assert.equal(cleanPdfRes.status, 201);

    const printDebitRes = await fetch(`${baseUrl}/api/wallet/debit-and-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        idempotencyKey: 'job-debit-1',
        stationId: 'kiosk-04',
        sessionToken: issued.session.token,
        items: [{ docId: 'doc-clean3', name: 'clean3.pdf', copies: 2, colourMode: 'bw', sides: '1-sided', removeBlankPages: true }],
      }),
    });
    assert.equal(printDebitRes.status, 201);
    const debitJson = (await printDebitRes.json()) as {
      order: { id: string; status: string; releaseCode: string; amountInr: number; totalPages: number; totalSheets: number };
      newBalanceInr: number;
    };
    assert.equal(debitJson.order.status, 'Queued');
    assert.match(debitJson.order.releaseCode, /^\d{4}$/);
    assert.equal(debitJson.order.totalPages, 2); // 3 pages - 1 blank = 2 pages/copy
    assert.equal(debitJson.order.totalSheets, 4); // 2 pages * 2 copies = 4 sheets
    assert.equal(debitJson.order.amountInr, 4); // ₹4
    assert.equal(debitJson.newBalanceInr, 96); // ₹100 - ₹4

    // Idempotent retry returns same order and doesn't double-debit
    const retryDebit = await fetch(`${baseUrl}/api/wallet/debit-and-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        idempotencyKey: 'job-debit-1',
        stationId: 'kiosk-04',
        sessionToken: issued.session.token,
        items: [{ docId: 'doc-clean3', name: 'clean3.pdf', copies: 2, colourMode: 'bw', sides: '1-sided', removeBlankPages: true }],
      }),
    });
    assert.equal(retryDebit.status, 201);
    const retryJson = (await retryDebit.json()) as { duplicate: boolean; newBalanceInr: number };
    assert.equal(retryJson.duplicate, true);
    assert.equal(retryJson.newBalanceInr, 96);

    // Kiosk polls jobs & releases by 4-digit PIN
    const kioskJobsRes = await fetch(`${baseUrl}/api/kiosk/kiosk-04/jobs`, {
      headers: { 'x-kiosk-secret': kioskSecret },
    });
    const kioskJobs = (await kioskJobsRes.json()) as { jobs: Array<{ id: string }> };
    assert.ok(kioskJobs.jobs.some((j) => j.id === debitJson.order.id));

    const claimRes = await fetch(`${baseUrl}/api/kiosk/jobs/release-by-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': kioskSecret },
      body: JSON.stringify({ stationId: 'kiosk-04', releaseCode: debitJson.order.releaseCode }),
    });
    assert.equal(claimRes.status, 200);
    const claimed = (await claimRes.json()) as { order: { status: string } };
    assert.equal(claimed.order.status, 'Claimed');

    // Kiosk downloads converted PDF (with blank page already stripped!)
    const kioskFileRes = await fetch(
      `${baseUrl}/api/kiosk/jobs/${encodeURIComponent(debitJson.order.id)}/files/doc-clean3`,
      { headers: { 'x-kiosk-secret': kioskSecret } }
    );
    assert.equal(kioskFileRes.status, 200);
    const downloadedBytes = Buffer.from(await kioskFileRes.arrayBuffer());
    const downloadedPdf = await PDFDocument.load(downloadedBytes);
    assert.equal(downloadedPdf.getPageCount(), 2);

    // Transition Printing -> Printed (must clean up temp file on disk)
    const printingRes = await fetch(`${baseUrl}/api/kiosk/jobs/${debitJson.order.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': kioskSecret },
      body: JSON.stringify({ status: 'Printing' }),
    });
    assert.equal(printingRes.status, 200);

    const printedRes = await fetch(`${baseUrl}/api/kiosk/jobs/${debitJson.order.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': kioskSecret },
      body: JSON.stringify({ status: 'Printed' }),
    });
    assert.equal(printedRes.status, 200);

    const fileAfterPrint = await fetch(
      `${baseUrl}/api/kiosk/jobs/${encodeURIComponent(debitJson.order.id)}/files/doc-clean3`,
      { headers: { 'x-kiosk-secret': kioskSecret } }
    );
    assert.equal(fileAfterPrint.status, 404);

    // 8. Tamper-proof Razorpay print job order (ignores tampered amountInr: 0.01) + Failed -> Refund flow
    const tamperedJobOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        idempotencyKey: 'rzp-job-tamper-test',
        amountInr: 0.01,
        purpose: 'print_job',
        stationId: 'kiosk-04',
        sessionToken: issued.session.token,
        items: [{ docId: 'doc-docx', name: 'notes.docx', copies: 3, colourMode: 'colour', sides: '1-sided', removeBlankPages: false }],
      }),
    });
    assert.equal(tamperedJobOrderRes.status, 201);
    const tamperedJobOrder = (await tamperedJobOrderRes.json()) as {
      orderId: string;
      amountInr: number;
      amountPaise: number;
    };
    assert.equal(tamperedJobOrder.amountInr, 9); // 1 page * ₹3 colour * 3 copies = ₹9 (tampered ₹0.01 ignored!)
    assert.equal(tamperedJobOrder.amountPaise, 900);

    const rzpJobPayId = 'pay_job_9';
    const rzpJobSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${tamperedJobOrder.orderId}|${rzpJobPayId}`)
      .digest('hex');

    const verifyJob = await fetch(`${baseUrl}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-alice' },
      body: JSON.stringify({
        razorpay_order_id: tamperedJobOrder.orderId,
        razorpay_payment_id: rzpJobPayId,
        razorpay_signature: rzpJobSig,
      }),
    });
    assert.equal(verifyJob.status, 200);
    const verifyJobJson = (await verifyJob.json()) as {
      verified: boolean;
      printOrder: { id: string; status: string; amountInr: number };
    };
    assert.equal(verifyJobJson.verified, true);
    assert.equal(verifyJobJson.printOrder.status, 'Queued');
    assert.equal(verifyJobJson.printOrder.amountInr, 9);

    // Kiosk reports paper jam failure -> Alice claims single atomic refund
    const failRes = await fetch(`${baseUrl}/api/kiosk/jobs/${verifyJobJson.printOrder.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kiosk-secret': kioskSecret },
      body: JSON.stringify({ status: 'Failed', failureReason: 'Paper jam at tray 1' }),
    });
    assert.equal(failRes.status, 200);

    const refundRes = await fetch(`${baseUrl}/api/orders/${verifyJobJson.printOrder.id}/refund`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-alice' },
    });
    assert.equal(refundRes.status, 200);
    const refundJson = (await refundRes.json()) as { success: boolean; newBalanceInr: number };
    assert.equal(refundJson.success, true);
    assert.equal(refundJson.newBalanceInr, 105); // 96 + 9 refund = ₹105

    // Duplicate refund must fail cleanly
    const dupRefundRes = await fetch(`${baseUrl}/api/orders/${verifyJobJson.printOrder.id}/refund`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-alice' },
    });
    assert.equal(dupRefundRes.status, 400);
  } finally {
    setCustomTokenVerifierForTests(null);
    server.closeAllConnections?.();
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env.RAZORPAY_KEY_ID = prevRzpKeyId;
    process.env.RAZORPAY_KEY_SECRET = prevRzpSecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = prevWebhookSecret;
  }
});
