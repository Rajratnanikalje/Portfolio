require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { sendContactNotification: sendTelegramNotification } = require('./utils/telegram');
const { sendPasswordResetOtp } = require('./utils/passwordResetEmail');

const app = express();
const port = process.env.PORT || 5000;
const schemas = {
  Profile: { name: { type: String, default: '' }, title: { type: String, default: '' }, shortBio: { type: String, default: '' }, about: { type: String, default: '' }, email: { type: String, default: '' }, phone: { type: String, default: '' }, location: { type: String, default: '' }, image: { type: String, default: '' }, logo: { type: String, default: '' }, favicon: { type: String, default: '' }, available: { type: Boolean, default: false }, socials: { type: [mongoose.Schema.Types.Mixed], default: [] } },
  Project: { title: { type: String, required: true, trim: true }, slug: { type: String, unique: true }, shortDescription: String, fullDescription: String, image: String, imagePublicId: String, technologies: [String], category: String, githubUrl: String, liveUrl: String, featured: { type: Boolean, default: false }, published: { type: Boolean, default: false }, displayOrder: { type: Number, default: 0 } },
  Skill: { name: { type: String, required: true }, category: String, level: { type: Number, min: 0, max: 100 }, icon: String, displayOrder: { type: Number, default: 0 }, published: { type: Boolean, default: false } },
  Experience: { jobTitle: { type: String, required: true }, company: String, location: String, startDate: String, endDate: String, currentlyWorking: Boolean, description: String, technologies: [String], displayOrder: Number, published: Boolean },
  Education: { degree: { type: String, required: true }, institution: String, location: String, startYear: String, endYear: String, description: String, displayOrder: Number, published: Boolean },
  Resume: { url: String, publicId: String, filename: String, current: { type: Boolean, default: true } },
  Message: { name: { type: String, required: true, maxlength: 100 }, email: { type: String, required: true, maxlength: 254 }, subject: { type: String, required: true, maxlength: 180 }, message: { type: String, required: true, maxlength: 5000 }, read: { type: Boolean, default: false } },
};
const models = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, mongoose.models[name] || mongoose.model(name, new mongoose.Schema(schema, { timestamps: true, strict: true }))]));
const Admin = mongoose.models.Admin || mongoose.model('Admin', new mongoose.Schema({
  email: { type: String, unique: true, required: true }, passwordHash: { type: String, required: true },
  passwordResetOtpHash: { type: String, default: null }, passwordResetOtpExpiresAt: { type: Date, default: null },
  passwordResetOtpAttempts: { type: Number, default: 0 }, passwordResetOtpRequestedAt: { type: Date, default: null },
  passwordResetTokenHash: { type: String, default: null }, passwordResetTokenExpiresAt: { type: Date, default: null },
}, { timestamps: true }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','application/pdf'].includes(file.mimetype)) });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
const auth = (req, res, next) => {
  try { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!token) return res.status(401).json({ message: 'Authentication required' }); req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: 'Session expired. Please sign in again.' }); }
};
const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const resetResponse = { message: 'If an account exists, an OTP has been sent.' };
const normalizeEmail = (value) => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
const validEmail = (value) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const hashOtp = (otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');
const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const matchesHash = (left, right) => {
  const a = Buffer.from(left || '', 'hex'), b = Buffer.from(right || '', 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};
const clearResetFields = {
  passwordResetOtpHash: null, passwordResetOtpExpiresAt: null, passwordResetOtpAttempts: 0,
  passwordResetTokenHash: null, passwordResetTokenExpiresAt: null,
};
const uploadCloud = async (file, folder) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw Object.assign(new Error('File uploads are not configured'), { status: 503 });
  const timestamp = Math.floor(Date.now()/1000), publicId = `${folder}-${crypto.randomBytes(8).toString('hex')}`;
  const params = `folder=portfolio/${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(`${params}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new FormData(); form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname); form.append('api_key', process.env.CLOUDINARY_API_KEY); form.append('timestamp', String(timestamp)); form.append('folder', `portfolio/${folder}`); form.append('public_id', publicId); form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: form }); const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || 'Upload failed'), { status: 502 }); return data;
};
const removeCloud = async (publicId, resourceType='image') => {
  if (!publicId || !process.env.CLOUDINARY_API_SECRET) return;
  const timestamp = Math.floor(Date.now()/1000), signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: process.env.CLOUDINARY_API_KEY, signature }); await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, { method:'POST', body:form });
};
const isGoogleDriveUrl = (value) => { try { const url = new URL(value); return url.protocol === 'https:' && ['drive.google.com','docs.google.com'].includes(url.hostname.toLowerCase()); } catch { return false; } };

app.get('/api/health', (req,res)=>res.json({ status:'ok' }));
app.post('/api/admin/forgot-password', safe(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.json(resetResponse);
  const admin = await Admin.findOne({ email });
  if (!admin) return res.json(resetResponse);

  const now = new Date();
  const cooldown = new Date(now.getTime() - 60_000);
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = hashOtp(otp);
  const updated = await Admin.findOneAndUpdate({
    _id: admin._id,
    $or: [
      { passwordResetOtpRequestedAt: { $exists: false } },
      { passwordResetOtpRequestedAt: null },
      { passwordResetOtpRequestedAt: { $lte: cooldown } },
    ],
  }, { $set: {
    passwordResetOtpHash: otpHash,
    passwordResetOtpExpiresAt: new Date(now.getTime() + 10 * 60_000),
    passwordResetOtpAttempts: 0,
    passwordResetOtpRequestedAt: now,
    passwordResetTokenHash: null,
    passwordResetTokenExpiresAt: null,
  } }, { new: true });
  if (!updated) return res.json(resetResponse);

  try {
    await sendPasswordResetOtp({ to: admin.email, otp });
  } catch (error) {
    await Admin.updateOne({ _id: admin._id, passwordResetOtpHash: otpHash }, { $set: clearResetFields });
    const safeCode = String(error?.code || error?.name || 'DELIVERY_ERROR').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    console.warn(`Password reset email delivery failed (${safeCode})`);
  }
  return res.json(resetResponse);
}));
app.post('/api/admin/verify-reset-otp', safe(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = typeof req.body?.otp === 'string' ? req.body.otp : '';
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Invalid or expired OTP.' });
  const admin = await Admin.findOne({ email });
  const now = new Date();
  if (!admin?.passwordResetOtpHash || !admin.passwordResetOtpExpiresAt || admin.passwordResetOtpExpiresAt <= now) {
    return res.status(400).json({ message: 'Invalid or expired OTP.' });
  }
  if (admin.passwordResetOtpAttempts >= 5) {
    await Admin.updateOne({ _id: admin._id, passwordResetOtpHash: admin.passwordResetOtpHash }, { $set: clearResetFields });
    return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
  }
  const otpHash = hashOtp(otp);
  if (!matchesHash(admin.passwordResetOtpHash, otpHash)) {
    const updated = await Admin.findOneAndUpdate({
      _id: admin._id,
      passwordResetOtpHash: admin.passwordResetOtpHash,
      passwordResetOtpExpiresAt: { $gt: now },
      $or: [{ passwordResetOtpAttempts: { $lt: 5 } }, { passwordResetOtpAttempts: { $exists: false } }],
    }, { $inc: { passwordResetOtpAttempts: 1 } }, { new: true });
    if (updated?.passwordResetOtpAttempts >= 5) {
      await Admin.updateOne({ _id: admin._id, passwordResetOtpHash: admin.passwordResetOtpHash }, { $set: clearResetFields });
      return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
    }
    return res.status(400).json({ message: 'Invalid or expired OTP.' });
  }

  const resetToken = crypto.randomBytes(32).toString('base64url');
  const consumed = await Admin.findOneAndUpdate({
    _id: admin._id,
    passwordResetOtpHash: admin.passwordResetOtpHash,
    passwordResetOtpExpiresAt: { $gt: now },
    $or: [{ passwordResetOtpAttempts: { $lt: 5 } }, { passwordResetOtpAttempts: { $exists: false } }],
  }, { $set: {
    passwordResetOtpHash: null, passwordResetOtpExpiresAt: null, passwordResetOtpAttempts: 0,
    passwordResetTokenHash: hashResetToken(resetToken),
    passwordResetTokenExpiresAt: new Date(now.getTime() + 10 * 60_000),
  } }, { new: true });
  if (!consumed) return res.status(400).json({ message: 'Invalid or expired OTP.' });
  return res.json({ message: 'OTP verified.', resetToken, expiresIn: 600 });
}));
app.post('/api/admin/reset-password', safe(async (req, res) => {
  const token = typeof req.body?.resetToken === 'string' ? req.body.resetToken : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!token || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be at least 12 characters and no more than 72 bytes.' });
  }
  const tokenHash = hashResetToken(token);
  const admin = await Admin.findOne({ passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: { $gt: new Date() } });
  if (!admin) return res.status(400).json({ message: 'Reset authorization is invalid or expired. Request a new OTP.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await Admin.findOneAndUpdate({
    _id: admin._id, passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: { $gt: new Date() },
  }, { $set: {
    passwordHash,
    ...clearResetFields,
  } }, { new: true });
  if (!updated) return res.status(400).json({ message: 'Reset authorization is invalid or expired. Request a new OTP.' });
  return res.json({ message: 'Password reset successfully. You can now log in.' });
}));
app.post('/api/auth/login', safe(async (req,res)=>{ const { email, password }=req.body || {}; const admin=await Admin.findOne({ email: String(email||'').toLowerCase().trim() }); if(!admin || !await bcrypt.compare(String(password||''),admin.passwordHash)) return res.status(401).json({ message:'Email or password is incorrect' }); const token=jwt.sign({ id:admin.id, email:admin.email },process.env.JWT_SECRET,{expiresIn:'12h'}); res.json({ token, admin:{ email:admin.email } }); }));
app.get('/api/profile', safe(async(req,res)=>res.json(await models.Profile.findOne().lean() || {})));
for (const [path, Model] of [['projects',models.Project],['skills',models.Skill],['experience',models.Experience],['education',models.Education]]) {
  app.get(`/api/${path}`, safe(async(req,res)=>res.json(await Model.find({published:true}).sort({displayOrder:1,createdAt:-1}).lean())));
  app.get(`/api/admin/${path}`,auth,safe(async(req,res)=>res.json(await Model.find().sort({displayOrder:1,createdAt:-1}).lean())));
  app.post(`/api/admin/${path}`,auth,safe(async(req,res)=>{ const data={...req.body}; if(Model===models.Project){data.slug=slugify(data.slug || data.title); if(await Model.exists({slug:data.slug})) return res.status(409).json({message:'A project with this slug already exists'});} res.status(201).json(await Model.create(data)); }));
  app.put(`/api/admin/${path}/:id`,auth,safe(async(req,res)=>{ const data={...req.body}; if(Model===models.Project)data.slug=slugify(data.slug || data.title); const previous=Model===models.Project?await Model.findById(req.params.id):null; const item=await Model.findByIdAndUpdate(req.params.id,data,{new:true,runValidators:true}); if(!item)return res.status(404).json({message:'Item not found'}); if(previous?.imagePublicId && previous.imagePublicId!==item.imagePublicId) await removeCloud(previous.imagePublicId); res.json(item); }));
  app.delete(`/api/admin/${path}/:id`,auth,safe(async(req,res)=>{const item=await Model.findByIdAndDelete(req.params.id); if(!item)return res.status(404).json({message:'Item not found'});if(Model===models.Project&&item.imagePublicId)await removeCloud(item.imagePublicId);res.json({success:true});}));
}
app.put('/api/admin/profile',auth,safe(async(req,res)=>res.json(await models.Profile.findOneAndUpdate({},req.body,{upsert:true,new:true,runValidators:true}))));
app.post('/api/admin/upload',auth,upload.single('file'),safe(async(req,res)=>{if(!req.file)return res.status(400).json({message:'Choose an image file'});if(req.file.mimetype==='application/pdf')return res.status(400).json({message:'Choose an image file'});const data=await uploadCloud(req.file,'image');res.json({url:data.secure_url,publicId:data.public_id,filename:req.file.originalname});}));
app.delete('/api/admin/upload',auth,safe(async(req,res)=>{await removeCloud(req.body.publicId,req.body.resourceType==='raw'?'raw':'image');res.json({success:true});}));
app.get('/api/resume',safe(async(req,res)=>res.json(await models.Resume.findOne({current:true}).lean() || null)));
app.put('/api/admin/resume',auth,safe(async(req,res)=>{const url=String(req.body?.url||'').trim();if(!isGoogleDriveUrl(url))return res.status(400).json({message:'Enter a valid Google Drive sharing URL'});await models.Resume.updateMany({},{$set:{current:false}});const doc=await models.Resume.create({url,current:true});res.json(doc);}));
app.delete('/api/admin/resume/:id',auth,safe(async(req,res)=>{const doc=await models.Resume.findByIdAndDelete(req.params.id);if(!doc)return res.status(404).json({message:'Resume not found'});res.json({success:true});}));
app.post('/api/contact',safe(async(req,res)=>{
  const input=req.body||{};
  const singleLine=(value)=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
  const name=singleLine(input.name), email=singleLine(input.email), subject=singleLine(input.subject);
  const message=typeof input.message==='string'?input.message.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim():'';
  if(!name||name.length>100||!email||email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||!subject||subject.length>180||!message||message.length>5000)
    return res.status(400).json({message:'Please complete all fields with a valid email'});

  const saved=await models.Message.create({name,email,subject,message});
  const receivedAt=saved.createdAt||new Date();
  try { await sendTelegramNotification({name,email,subject,message},receivedAt); }
  catch(error) {
    const detail=error?.telegramDescription||error?.code||error?.name||'UNKNOWN';
    console.warn(`Telegram notification failed: ${String(detail).replace(/[\r\n\t]+/g,' ').slice(0,300)}`);
  }
  res.status(201).json({message:'Thanks. Your message has been sent.'});
}));
app.get('/api/admin/messages',auth,safe(async(req,res)=>res.json(await models.Message.find().sort({createdAt:-1}).lean())));
app.patch('/api/admin/messages/:id',auth,safe(async(req,res)=>{const item=await models.Message.findByIdAndUpdate(req.params.id,{read:Boolean(req.body.read)},{new:true});if(!item)return res.status(404).json({message:'Message not found'});res.json(item);}));
app.delete('/api/admin/messages/:id',auth,safe(async(req,res)=>{const item=await models.Message.findByIdAndDelete(req.params.id);if(!item)return res.status(404).json({message:'Message not found'});res.json({success:true});}));
app.get('/api/admin/stats',auth,safe(async(req,res)=>{const [projects,published,featured,skills,messages,unread,resume]=await Promise.all([models.Project.countDocuments(),models.Project.countDocuments({published:true}),models.Project.countDocuments({featured:true}),models.Skill.countDocuments(),models.Message.countDocuments(),models.Message.countDocuments({read:false}),models.Resume.exists({current:true})]);res.json({projects,published,featured,skills,messages,unread,resume:Boolean(resume)});}));
app.use((req,res)=>res.status(404).json({message:'Route not found'}));
app.use((err,req,res,next)=>{console.error(err.message);const status=err.status|| (err.name==='ValidationError'?400:err.name==='CastError'?400:500);res.status(status).json({message:status===500?'Something went wrong':err.message, ...(err.name==='ValidationError'?{details:Object.values(err.errors).map(x=>x.message)}:{})});});

async function start(){
  for(const key of ['MONGODB_URI','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD']) if(!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  await mongoose.connect(process.env.MONGODB_URI);
  const email=process.env.ADMIN_EMAIL.toLowerCase().trim();if(!await Admin.exists({email})) await Admin.create({email,passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD,12)});
  app.listen(port,()=>console.log(`Portfolio API listening on ${port}`));
}
start().catch(err=>{console.error(`Startup failed: ${err.message}`);process.exit(1);});
