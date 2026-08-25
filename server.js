const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const supabase = require('./supabaseClient');
const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

// --- CẤU HÌNH GỬI EMAIL (Nodemailer) ---
  const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465, // Hoặc 587
        secure: true, // true cho port 465, false cho các port khác
        auth: {
            user: 'nguyenquocviet2018ca@gmail.com', // Thay bằng email của bạn
            pass: 'pehvreeenoyeqocz'   // Thay bằng App Password của Gmail
        }
    });
// Chia sẻ transporter sang các routes khác
app.locals.transporter = transporter;
app.locals.ADMIN_EMAIL = 'nguyenquocviet2018ca@gmail.com';

// Phục vụ các file tĩnh trong thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024
});

const JWT_SECRET = process.env.JWT_SECRET;

app.use('/api', authRoutes);

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Lỗi xác thực: Thiếu Token!"));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Lỗi xác thực: Token không hợp lệ!"));
    socket.user = decoded; 
    next();
  });
});

app.post('/api/log-ip', async (req, res) => {
  const { username, ip, city, country } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: "Thiếu thông tin username" });
  }

  const { error } = await supabase
    .from('user_logs')
    .insert([{ username, ip, city, country }]);

  if (error) {
    console.error("Lỗi lưu IP vào DB:", error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ success: true, message: "Đã lưu log thành công!" });
});

io.on('connection', (socket) => {
  console.log(`Người dùng đã kết nối: ${socket.user.username}`);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.user.username} đã vào phòng: ${room}`);
  });

  socket.on('send_message', async (data) => {
    const { room, message, file } = data;
    const sender = socket.user.username;

    const dbMessage = message || (file ? `[Đính kèm file: ${file.name}]` : "");

    const { error } = await supabase
      .from('messages')
      .insert([{ room, sender, message: dbMessage }]);

    if (error) {
      console.error("Lỗi lưu tin nhắn vào DB:", error.message);
      return;
    }

    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (!countError && count !== null && count >= 50) {
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .neq('id', 0);

      if (!deleteError) {
        io.to(room).emit('receive_message', {
          sender: "Hệ thống",
          message: "⚠️ Đã đạt giới hạn 50 tin nhắn. Lịch sử chat vừa được làm sạch tự động!",
          file: null,
          created_at: new Date()
        });
      }
    }

    io.to(room).emit('receive_message', {
      sender,
      message,
      file,
      created_at: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log(`Người dùng ngắt kết nối: ${socket.user.username}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy thành công trên cổng ${PORT}`);
});