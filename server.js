const express=require('express');
const cors=require('cors');
const path=require('path');
const fs=require('fs');
const multer=require('multer');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const Database=require('better-sqlite3');

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET;
if(!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.');
const ROOT=__dirname, UP=path.join(ROOT,'uploads');
fs.mkdirSync(UP,{recursive:true});
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
const allowedOrigin=process.env.FRONTEND_ORIGIN||true;
app.use(cors({origin:allowedOrigin,credentials:false}));
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(ROOT,'public')));
app.get('/health', (req,res)=>res.json({ok:true,service:'stenopro'}));
const authLimiter=rateLimit({windowMs:15*60*1000,max:60,standardHeaders:true,legacyHeaders:false});
app.use('/api/auth/',authLimiter);

const db=new Database(path.join(ROOT,'stenopro.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dictations(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,language TEXT NOT NULL,wpm INTEGER NOT NULL,duration_minutes INTEGER NOT NULL,passage TEXT NOT NULL,audio_filename TEXT NOT NULL,audio_original_name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,dictation_id INTEGER NOT NULL,wpm REAL NOT NULL,accuracy REAL NOT NULL,errors INTEGER NOT NULL,elapsed_seconds INTEGER NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(dictation_id) REFERENCES dictations(id));`);

function now(){return new Date().toISOString()}
function token(user){return jwt.sign({id:user.id,role:user.role,name:user.name,email:user.email},JWT_SECRET,{expiresIn:'7d'})}
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Authentication required'});req.user=jwt.verify(h.slice(7),JWT_SECRET);next()}catch{return res.status(401).json({error:'Invalid or expired token'})}}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Admin only'});next()}
function words(s){return s.trim()?s.trim().split(/\s+/):[]}
function score(source,typed){const a=words(source),b=words(typed);let correct=0;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i].toLowerCase()===b[i].toLowerCase())correct++;const total=Math.max(a.length,b.length);return {correct,total,errors:total-correct,accuracy:total?+(correct/total*100).toFixed(2):0}}

const adminEmail=process.env.ADMIN_EMAIL;
const adminPass=process.env.ADMIN_PASSWORD;
if(!adminEmail || !adminPass) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
if(!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail))db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run('StenoPro Admin',adminEmail,bcrypt.hashSync(adminPass,12),'admin',now());

app.post('/api/auth/register',(req,res)=>{const {name,email,password}=req.body||{};if(!name||!email||!password||password.length<8)return res.status(400).json({error:'Name, email and password (8+ chars) are required'});try{const info=db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(name.trim(),email.trim().toLowerCase(),bcrypt.hashSync(password,12),'student',now());const u=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(info.lastInsertRowid);res.json({token:token(u),user:u})}catch(e){res.status(409).json({error:'Email already registered'})}});
app.post('/api/auth/login',(req,res)=>{const {email,password}=req.body||{};const u=db.prepare('SELECT * FROM users WHERE email=?').get((email||'').trim().toLowerCase());if(!u||!bcrypt.compareSync(password||'',u.password_hash))return res.status(401).json({error:'Invalid email or password'});res.json({token:token(u),user:{id:u.id,name:u.name,email:u.email,role:u.role}})});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/dictations',auth,(req,res)=>{const rows=db.prepare('SELECT id,title,language,wpm,duration_minutes,passage,audio_original_name,created_at FROM dictations ORDER BY id DESC').all();res.json({dictations:rows.map(x=>({...x,audio_url:`/api/dictations/${x.id}/audio`}))})});

const storage=multer.diskStorage({destination:UP,filename:(req,file,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+'.mp3')});
const upload=multer({storage,limits:{fileSize:(Number(process.env.MAX_AUDIO_MB)||50)*1024*1024},fileFilter:(req,file,cb)=>{const ok=file.mimetype==='audio/mpeg'||path.extname(file.originalname).toLowerCase()==='.mp3';cb(ok?null:new Error('Only MP3 files are allowed'),ok)}});
app.post('/api/admin/dictations',auth,admin,upload.single('audio'),(req,res)=>{try{if(!req.file)return res.status(400).json({error:'MP3 file required'});const {title,language,wpm,duration_minutes,passage}=req.body;if(!title||!passage||!wpm||!duration_minutes)return res.status(400).json({error:'title, language, wpm, duration and passage are required'});const info=db.prepare('INSERT INTO dictations(title,language,wpm,duration_minutes,passage,audio_filename,audio_original_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(title,language,Number(wpm),Number(duration_minutes),passage,req.file.filename,req.file.originalname,now());res.status(201).json({id:info.lastInsertRowid,message:'Dictation uploaded'})}catch(e){if(req.file)fs.rmSync(path.join(UP,req.file.filename),{force:true});res.status(400).json({error:e.message})}});
app.delete('/api/admin/dictations/:id',auth,admin,(req,res)=>{const d=db.prepare('SELECT * FROM dictations WHERE id=?').get(req.params.id);if(!d)return res.status(404).json({error:'Not found'});db.prepare('DELETE FROM dictations WHERE id=?').run(req.params.id);fs.rmSync(path.join(UP,d.audio_filename),{force:true});res.json({message:'Deleted'})});
app.get('/api/dictations/:id/audio',(req,res,next)=>{if(req.query.token){req.headers.authorization='Bearer '+req.query.token}auth(req,res,next)},(req,res)=>{const d=db.prepare('SELECT audio_filename FROM dictations WHERE id=?').get(req.params.id);if(!d)return res.sendStatus(404);const file=path.join(UP,d.audio_filename);if(!fs.existsSync(file))return res.sendStatus(404);res.type('audio/mpeg');res.sendFile(file)});

app.post('/api/results',auth,(req,res)=>{const {dictation_id,typed_text,elapsed_seconds}=req.body||{};const d=db.prepare('SELECT * FROM dictations WHERE id=?').get(dictation_id);if(!d)return res.status(404).json({error:'Dictation not found'});const s=score(d.passage,typed_text||'');const elapsed=Math.max(1,Number(elapsed_seconds)||1);const wpm=+(words(typed_text||'').length/(elapsed/60)).toFixed(2);const info=db.prepare('INSERT INTO results(user_id,dictation_id,wpm,accuracy,errors,elapsed_seconds,created_at) VALUES(?,?,?,?,?,?,?)').run(req.user.id,d.id,wpm,s.accuracy,s.errors,elapsed,now());res.status(201).json({id:info.lastInsertRowid,wpm,accuracy:s.accuracy,errors:s.errors})});
app.get('/api/results/me',auth,(req,res)=>res.json({results:db.prepare(`SELECT r.*,d.title,d.language,d.wpm AS target_wpm FROM results r JOIN dictations d ON d.id=r.dictation_id WHERE r.user_id=? ORDER BY r.id DESC`).all(req.user.id)}));
app.get('/api/admin/users',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC').all()}));
app.get('/api/admin/results',auth,admin,(req,res)=>res.json({results:db.prepare(`SELECT r.*,u.name,u.email,d.title,d.language,d.wpm AS target_wpm FROM results r JOIN users u ON u.id=r.user_id JOIN dictations d ON d.id=r.dictation_id ORDER BY r.id DESC`).all()}));

app.use((err,req,res,next)=>{res.status(400).json({error:err.message||'Request failed'})});
app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.listen(PORT,()=>console.log(`StenoPro server running on http://localhost:${PORT}`));
