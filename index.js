require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:5173", "https://rev0x.netlify.app"],
    credentials: true,
   
  })
);
// methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
// allowedHeaders: ["Content-Type", "Authorization"],
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized token" });
  }
  try {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) return res.status(401).send({ message: "Unauthorized token" });
      req.decoded = decoded;
      // console.log(decoded);
      next();
    });
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
    "utf-8"
  )
);
// 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4yne8ye.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const serviceCollection = client.db("serviceDB").collection("services");

    const rattingsCollection = client.db("serviceDB").collection("ratings");

    // jwt api create

    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const user = email;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      // set token in the cookie
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax", 
      });

      res.send({ success: true });
    });

    app.get("/counts", async (req, res) => {
      try {
        // Count Firebase Auth Users....
        let userCount = 0;
        async function countUsers(nextPageToken) {
          const result = await admin.auth().listUsers(1000, nextPageToken);
          userCount += result.users.length;
          if (result.pageToken) {
            await countUsers(result.pageToken);
          }
        }
        await countUsers();

        // Count Services and Reviews from MongoDB ...
        const totalServices = await serviceCollection.countDocuments();
        const totalReviews = await rattingsCollection.countDocuments();

        // Send all counts
        res.json({
          users: userCount,
          services: totalServices,
          reviews: totalReviews,
        });
      } catch (error) {
        console.error("Error fetching counts:", error);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    app.get("/servicesbylimit", async (req, res) => {
      const quary = {};
      const cursor = serviceCollection.find(quary).sort({ _id: -1 }); // sort({ _id: -1 }) recent add kora ta aga dekhabe
      const result = await cursor.limit(8).toArray();
      res.send(result);
    });

    app.get("/allServices", async (req, res) => {
      const search = req.query.search || "";
      const category = req.query.category || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 8;
      const skip = (page - 1) * limit;

      try {
        const query = {};

        // Search by serviceTitle, category, or companyName
        if (search) {
          const regex = new RegExp(search, "i");
          query.$or = [
            { serviceTitle: regex },
            { category: regex },
            { companyName: regex },
          ];
        }

        // If category is specified, it overrides
        if (category) {
          query.category = category;
        }

        const total = await serviceCollection.countDocuments(query);
        const services = await serviceCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          total,
          page,
          limit,
          services,
        });
      } catch (error) {
        console.error("Search/Filter/Pagination Error:", error);
        res.status(500).send("Server error");
      }
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.findOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 20;

      try {
        const reviews = await rattingsCollection
          .find({})
          .sort({ _id: -1 }) 
          .skip(page * limit)
          .limit(limit)
          .toArray();

        res.send(reviews);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch reviews" });
      }
    });

    app.get("/allreviews/:id", async (req, res) => {
      const Id = req.params.id;
      // console.log(Id);
      const quary = { reatingId: Id };
      const reviewedId = rattingsCollection.find(quary);
      const result = await reviewedId.toArray();
      res.send(result);
    });

    app.get("/myservices", verifyToken, async (req, res) => {
      const email = req.query.email;
      // console.log(email);

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      if (!email) {
        return res
          .status(400)
          .send({ message: "Email query parameter is required." });
      }
      const quary = { userEmail: email };
      const cursor = serviceCollection.find(quary);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/myreviews", verifyToken, async (req, res) => {
      const email = req.query.email;
      // console.log(email);

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      if (!email) {
        return res
          .status(400)
          .send({ message: "Email query parameter is required." });
      }
      const quary = { email };
      const cursor = rattingsCollection.find(quary);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/services", verifyToken, async (req, res) => {
      const service = req.body;
      const emailFromClient = req.body.userEmail;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const result = serviceCollection.insertOne(service);

      res.send(result);
    });

    app.post("/reviews", verifyToken, async (req, res) => {
      const ratting = req.body;
      const emailFromClient = req.body.email;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }
      const result = rattingsCollection.insertOne(ratting);

      res.send(result);
    });

    app.patch("/updateservices/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const emailFromClient = req.body.email;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const filter = { _id: new ObjectId(id) };

      const {
        serviceImage,
        serviceTitle,
        companyName,
        website,
        description,
        category,
        price,
      } = req.body;

      const updateDoc = {
        $set: {
          serviceImage,
          serviceTitle,
          companyName,
          website,
          description,
          category,
          price,
        },
      };
      const result = await serviceCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/myreviews/update/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const emailFromClient = req.body.email;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const filter = { _id: new ObjectId(id) };

      const { text, rating } = req.body;

      const updateDoc = {
        $set: {
          text,
          rating,
        },
      };
      const result = await rattingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/services/delete/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const emailFromClient = req.body.email;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const result = await serviceCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.delete("/myreviews/delete/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const emailFromClient = req.body.email;

      const emailFromToken = req.decoded.email;

      if (emailFromClient !== emailFromToken) {
        return res.status(403).send({ message: "Forbidden: Email mismatch" });
      }

      const result = await rattingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Send a ping to confirm a successful connection

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
