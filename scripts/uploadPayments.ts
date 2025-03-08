import uploadPaymentsToQdrant from "../app/utils/uploadPaymentsToQdrant";

uploadPaymentsToQdrant()
  .then(() => {
    console.log("Upload completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Upload failed:", error);
    process.exit(1);
  });
