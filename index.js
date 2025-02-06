const express = require("express");
const multer = require("multer");
const path = require("path");
const {
  S3Client,
  UploadPartCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure S3 client
const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_DEFAULT_ACCESS_KEY,
    secretAccessKey: process.env.AWS_DEFAULT_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_S3_REGION,
  signatureVersion: process.env.AWS_S3_SIGNATURE_VERSION
});

// In-memory cache to track upload state
const uploadCache = {};

// Custom Multer storage engine
class S3CustomStorage {
  constructor() {}

  async _initiateMultipartUpload(bucket, key) {
    const { UploadId } = await s3Client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key })
    );
    return UploadId;
  }

  async _uploadPart(partNumber, stream, bucket, key, uploadId, size) {
    try {
      const { ETag } = await s3Client.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: stream,
          ContentLength: size,
        })
      );
      return { PartNumber: partNumber, ETag };
    } catch (err) {
      console.log(
        `Error uploading part ${partNumber} with content-size ${size} for ${key} `,
        err
      );
      throw err;
    }
  }

  async _completeMultipartUpload(bucket, key, uploadId, parts) {
    const { Location } = await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
        },
      })
    );
    return Location;
  }

  async _abortMultipartUpload(bucket, key, uploadId) {
    return await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  }

  async _handleFile(req, file, cb) {
    const {
      resumableFilename: fileName,
      resumableCurrentChunkSize: chunkSize,
      resumableTotalChunks: totalChunks,
      resumableChunkNumber: partNumber,
    } = req.body;

    // Extract the bucket and key from environment variables
    const bucket = process.env.AWS_S3_BUCKET;
    const key = `${process.env.AWS_S3_BUCKET_FOLDER_KEY}/${fileName}`;

    console.log(
      `Uploading part ${partNumber} of ${totalChunks} for ${key} with size ${chunkSize}`
    );

    // Initialize the cache entry for this file
    if (!uploadCache[key]) {
      const uploadId = await this._initiateMultipartUpload(bucket, key);
      uploadCache[key] = { uploadId, parts: [] };
    }

    const { uploadId, parts } = uploadCache[key];

    try {
      const part = await this._uploadPart(
        partNumber,
        file.stream,
        bucket,
        key,
        uploadId,
        chunkSize
      );
      parts.push(part);

      cb(null, { bucket, key, uploadId });

      // If the file upload is complete, finalize the multipart upload
      if (totalChunks == parts.length) {
        const location = await this._completeMultipartUpload(
          bucket,
          key,
          uploadId,
          parts
        );
        console.log("File uploaded successfully:", location);
        // Clean up cache after completion
        delete uploadCache[key];
      }
    } catch (err) {
      delete uploadCache[key];
      await this._abortMultipartUpload(bucket, key, uploadId);
      cb(err);
    }
  }

  async _removeFile(req, file, cb) {
    // Cleanup logic can go here if needed
    cb(null);
  }
}

// Initialize Multer with custom storage
const upload = multer({ storage: new S3CustomStorage() });

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({
    success: true,
    bucket: req.file.bucket,
    key: req.file.key,
    uploadId: req.file.uploadId,
    message: "File part uploaded to S3",
  });
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
