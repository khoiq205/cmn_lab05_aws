const express = require("express");
const app = express();
const PORT = 3000;
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
const { log } = require("console");

// Cấu hình AWS
process.env.AWS_SDK_MODE_MESSAGE = "1";

// Cấu hình aws sdk để truy cập vào Cloud Aws thông qua tài khoản IAM user
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3(); // Khai báo service S3
const dynamodb = new AWS.DynamoDB.DocumentClient(); // Khai báo service DynamoDB

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

// Cấu hình multer để quản lý upload image
const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2000000 }, // maximum 2MB
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});
function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/;

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  }
  return cb("Error: Please upload image /jpeg|jpg|png|gif only!");
}
// register middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("./views"));

//config view
app.set("view engine", "ejs");
app.set("views", "./views");

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// render data
app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    console.log("data=", data.Items);
    return res.render("index.ejs", { products: data.Items });
  } catch (error) {
    console.error("Error retrieving data from DynamoDB", error);
    return res.status(500).send("Interal Server Error");
  }
});

//save
app.post("/save", upload.single("image"), (req, res) => {
  try {
    const id = Number(req.body.id);
    const name = req.body.name;
    const amount = Number(req.body.amount);
    const manufacturer = req.body.manufacturer;
    const input_power = req.body.input_power;
    console.log(req.body.input_power);
    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${id}_${Date.now().toString()}.${fileType}`;

    const paramsS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.log("error=", err);
        return res.send("Internal server error!");
      } else {
        const imgUrl = data.Location; // Gán URL s3 trả về vào field trong table DynamoDB
        const paramsDynamoDB = {
          TableName: tableName,
          Item: {
            id: Number(id),
            name: name,
            amount: amount,
            manufacturer: manufacturer,
            input_power: input_power,
            image: imgUrl,
          },
        };

        await dynamodb.put(paramsDynamoDB).promise();
        return res.redirect("/");
      }
    });
  } catch (error) {
    console.error("Error saving data from DynamoDB:", error);
    return res.status(500).send("Internal Server Error");
  }
});

//delete
app.post("/delete", upload.fields([]), (req, res) => {
  const listCheckboxSelected = Object.keys(req.body);
  if (!listCheckboxSelected || listCheckboxSelected.length <= 0)
    return res.redirect("/");
  try {
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          id: Number(listCheckboxSelected[length]),
        },
      };
      dynamodb.delete(params, (err, data) => {
        if (err) {
          console.log("error=", err);
          return res.send("Internal Server Error");
        } else if (length > 0) onDeleteItem(length - 1);
        else return res.redirect("/");
      });
    }
    onDeleteItem(listCheckboxSelected.length - 1);
  } catch (error) {
    console.log("Error deleting data from DynamoDB:", error);
    return res.status(500).send("Internal Server Error");
  }
});
app.get("/filter", async (req, res) => {
  const filter_value = req.query.filter_manufacturer;
  const params = {
    TableName: tableName,
    FilterExpression: "manufacturer = :value",
    ExpressionAttributeValues: {
      ":value": filter_value,
    },
  };
  const data = dynamodb.scan(params, (err, data) => {
    if (err) {
      console.log("error =", err);
      return res.send("Internal Server Error");
    } else 
    console.log("data filter =", data);
    return res.render("index.ejs", { products: data.Items });
  });
});
