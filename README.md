This is a temporary repo to reproduce the issue mentioned here [Issue](https://github.com/aws/aws-sdk-js-v3/issues/6859)

# Prerequisite
Node.js >= 20

# Getting Started
1. copy environment variables from .env.example to .env
2. Replace the environment variables with appropriate values.
3. Run
```
npm install
```
4. Run
```
npm start
```
5. Go the displayed server location to verify it is working.


# How to reproduce the bug
1. Upload some smaller files that is less than 2MB. Verify that it is uploaded correctly.
2. Upload some files that is larger than 2MB (Ideally larger than 10MB to be absolutely sure). Verify that it is failing to the chunk size error in the last chunk (Though it is sending correct chunk size).

