const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const GuideService = require('./models/GuideService')
const Booking = require('./models/Booking');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const imageDownloader = require('image-downloader');
const multer = require('multer');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const fs = require('fs');
const app = express();
const path = require('path');
const { rejects } = require('assert');
const mime = require('mime-types');

// Auto generate salt to add to the encrypted password
const bcryptSalt = bcrypt.genSaltSync(10);

// Define jwt secret
const jwtSecret = "fasdgasdgqawegqadgas";

const bucket = 'connect-guides-bucket';

app.use(express.json());

app.use('/uploads', express.static(__dirname+'/uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix);
    }
});
const upload = multer({ storage });

app.use(cookieParser());

app.use(cors({
    credentials: true,
    origin: 'http://localhost:5173',
}));




async function uploadToS3(path, originalFilename, mimetype) {
  const client = new S3Client({
    region: 'us-east-2',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    }
  });
  const parts = originalFilename.split('.');
  const ext = parts[parts.length - 1];
  const newFilename = Date.now() + '.' + ext;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Body: fs.readFileSync(path),
    Key: newFilename,
    ContentType: mimetype,
    ACL: 'public-read',
  }));
  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}


function getUserDataFromReq(req) {
    return new Promise((resolve, reject) =>{
        jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
            if(err) throw err;
            resolve(userData);
        });
    });    
}

app.get('/api/test', (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  res.json('test ok');
});

app.post('/api/register', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const {name, email, password,phone,address} = req.body;

    try {
        const userDoc = await User.create({
            name,
            email,
            password:bcrypt.hashSync(password, bcryptSalt),
            phone,
            address
        });
        res.json(userDoc);
    } catch (e) {
        res.status(422).json(e);
    } 
});


app.post('/api/login', async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({
        email: userDoc.email,
        id: userDoc._id
      }, jwtSecret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token).json(userDoc);
      });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});



// app.post('/login', async (req, res) => {
//   const { email, password } = req.body;
//   const userDoc = await User.findOne({ email });
//   if (userDoc) {
//     const passOk = bcrypt.compareSync(password, userDoc.password);
//     if (passOk) {
//       jwt.sign({
//         email: userDoc.email,
//         id: userDoc._id
//       }, jwtSecret, {}, (err, token) => {
//         if (err) throw err;
//         res.cookie('token', token).json(userDoc);
//       });
//     } else {
//       res.status(422).json({ error: 'Invalid password' });
//     }
//   } else {
//     res.status(404).json({ error: 'User not found' });
//   }
// });


// app.post('/login', async (req, res) => {
//   const { email, password } = req.body;
//   const userDoc = await User.findOne({email});
//   if (userDoc) {
//     const passOk = bcrypt.compareSync(password, userDoc.password)
//     if (passOk) {
//         jwt.sign({
//             email:userDoc.email, 
//             id:userDoc._id
//         }, jwtSecret, {}, (err, token) => {
//             if (err) throw err;
//             res.cookie('token', token).json(userDoc);
//         });    
//     } else {
//         res.status(422).json('pass not ok');
//     }
//   } else {
//     res.json('not found');
//   }
// });

async function downloadImage(link) {
    const newName = 'photo' + Date.now() + '.jpg';
    await imageDownloader.image({
        url: link,
        dest: path.join(__dirname, 'uploads', newName)
    });
    return newName;
}


app.post('/api/upload-by-link', async (req, res) => {
  const { link } = req.body;
  const newName = 'photo' + Date.now() + '.jpg';
  await imageDownloader.image({
    url: link,
    dest: '/tmp/' + newName,
  });
  const url = await uploadToS3('/tmp/' + newName, newName, mime.lookup('/tmp/' + newName))
  res.json(url);
});

// app.post('/upload-by-link', async (req, res) => {
//     mongoose.connect(process.env.MONGO_URL);
//     const { link } = req.body;
//     try {
//         const filename = await downloadImage(link);
//         res.json(`/uploads/${filename}`);
//     } catch (error) {
//         res.status(500).json({ message: 'Failed to download image', error });
//     }
// });


const photosMiddleware = multer({ dest: '/tmp' });
app.post('/api/upload', photosMiddleware.array('photos', 100), async (req, res) => {
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const {path, originalname, mimetype} = req.files[i];
    const url = await uploadToS3(path, originalname, mimetype);
    uploadedFiles.push(url);
  }
  res.json(uploadedFiles);
});



// const photosMiddleware = multer({ dest: 'uploads/' });
// app.post('/upload', photosMiddleware.array('photos', 100), async (req, res) => {
//     const uploadedFiles = [];
//     for (let i = 0; i < req.files.length; i++) {
//         const { path: filePath, originalname } = req.files[i];
//         const parts = originalname.split('.');
//         const ext = parts[parts.length - 1]; // Corrected typo
//         const newPath = filePath + '.' + ext;
//         fs.renameSync(filePath, newPath);
//         uploadedFiles.push(`/uploads/${path.basename(newPath)}`);
//     }
//     res.json(uploadedFiles);
// });


app.get("/api/account", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        console.error('Token verification failed:', err);
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const user = await User.findById(userData.id);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        const { name, email, _id } = user;
        res.json({ name, email, _id });
      } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
  } else {
    res.status(401).json({ error: 'No token provided' });
  }
});



    
// app.get("/account", (req, res) => {
//   const { token } = req.cookies;
//   if (token) {
//     jwt.verify(token, jwtSecret, {}, async (err, userData) => {
//       if (err) throw err;
//       const {name, email, _id} = await User.findById(userData.id);
//       res.json({name, email, _id});
//     });
//   } else {
//     res.json(null);
//   }
// });

app.post('/api/logout', (req, res) => {
    res.cookie('token', '').json(true);
});


app.post('/api/guideService', (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { token } = req.cookies;
    const {
      title, city, addedPhotos, description,
      services, extraInfo, maxTravelers, price,
    } = req.body;
  
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
  
      try {

        const ownerDoc = await User.findById(userData.id);
        if (!ownerDoc) {
          return res.status(404).json({ error: 'Owner not found' });
        }
  
        const guideServiceDoc = await GuideService.create({
          owner: userData.id,
          ownerName: ownerDoc.name,
          price,
          title,
          city,
          photos: addedPhotos,
          description,
          services,
          extraInfo,
          maxTravelers,
        });
  
        res.json(guideServiceDoc);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

app.get('/api/user-guideService', (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { token } = req.cookies;
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
        const {id} = userData;
        res.json( await GuideService.find({owner:id}) );
    });
});

app.get('/api/guideService/:id', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const {id} = req.params;
    res.json(await GuideService.findById(id))
});

app.put('/api/guideService', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { token } = req.cookies;
    const {
      id, title, city, addedPhotos, description,
      services, extraInfo, maxTravelers, price,
    } = req.body;
  
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
  
      try {
        const guideServiceDoc = await GuideService.findById(id);
        if (!guideServiceDoc) {
          return res.status(404).json({ error: 'Guide service not found' });
        }
  
        if (userData.id !== guideServiceDoc.owner.toString()) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
  
        // Find the owner document in the User collection
        const ownerDoc = await User.findById(userData.id);
        if (!ownerDoc) {
          return res.status(404).json({ error: 'Owner not found' });
        }
  
        // Update the GuideService document with the new fields including ownerName
        guideServiceDoc.set({
          title,
          city,
          photos: addedPhotos,
          description,
          services,
          extraInfo,
          maxTravelers,
          price,
          ownerName: ownerDoc.name, // Update the ownerName field
        });
  
        await guideServiceDoc.save();
        res.json('ok');
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

// gets all services
app.get('/api/guideService', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    res.json(
        await GuideService.find()
    );
});

app.post('/api/bookings', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const userData = await getUserDataFromReq(req);
    const {singleGuideService, checkIn, 
        checkOut, numberOfTravelers, 
        name, phone, price,
    } = req.body;
    Booking.create({
        singleGuideService, checkIn, 
        checkOut, numberOfTravelers, 
        name, phone, price, user:userData.id,
    }).then((doc) => {
        res.json(doc);
    }).catch(() => {
        throw err;
    });
});

app.get('/api/bookings', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const userData = await getUserDataFromReq(req);
    res.json(await Booking.find({user:userData.id}).populate('singleGuideService'))
});

app.get('/api/search', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { query } = req.query;
    try {
        const results = await GuideService.find({ city: new RegExp(query, 'i') });
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(4000, () => {
    console.log('Server running on port 4000');
});