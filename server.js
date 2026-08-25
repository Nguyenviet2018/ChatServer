const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
// const nodemailer = require('nodemailer');
require('dotenv').config();
const config = require('./config'); // Nhập file config
const supabase = require('./supabaseClient');
const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

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

// --- XÁC THỰC SOCKET BẰNG JWT ---
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


// --- QUẢN LÝ TẤT CẢ SỰ KIỆN SOCKET.IO TRONG 1 KHỐI DUY NHẤT ---

const onlineUsers = new Map(); // Lưu trữ socket.id -> username

io.on('connection', (socket) => {
  const username = socket.user.username;
  console.log(`⚡ Người dùng đã kết nối: ${username} (Socket ID: ${socket.id})`);

  // 1. Tự động thêm vào danh sách online ngay khi kết nối thành công qua Token
  onlineUsers.set(socket.id, username);
  io.emit('update_online_users', Array.from(onlineUsers.values()));

  // 2. Vào phòng chat
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${username} đã vào phòng: ${room}`);
  });

  // 3. Gửi tin nhắn
  socket.on('send_message', async (data) => {
    const { room, message, file } = data;
    const msg = message ? message.trim() : "";

        // Kiểm tra lệnh khóa đăng ký thông qua app.locals
        if (msg === ":lock-pass:admin@123456") {
            config.isRegistrationLocked = true; // Cập nhật trạng thái khóa
            io.to(room).emit('receive_message', {
                sender: "Hệ thống",
                message: "🔒 Quản trị viên đã KHÓA tính năng đăng ký tài khoản mới."
            });
            return;
        }

        // Kiểm tra lệnh mở đăng ký thông qua app.locals
        if (msg === ":unlock-pass:admin@123456") {
           config.isRegistrationLocked = false;  // Mở lại trạng thái
            io.to(room).emit('receive_message', {
                sender: "Hệ thống",
                message: "🔓 Quản trị viên đã MỞ LẠI tính năng đăng ký tài khoản mới."
            });
            return;
        }

    const dbMessage = message || (file ? `[Đính kèm file: ${file.name}]` : "");

    const { error } = await supabase
      .from('messages')
      .insert([{ room, sender: username, message: dbMessage }]);

    if (error) {
      console.error("Lỗi lưu tin nhắn vào DB:", error.message);
      return;
    }

    // Kiểm tra giới hạn 50 tin nhắn để dọn dẹp
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
      sender: username,
      message,
      file,
      created_at: new Date()
    });
  });

  // 4. Khi ngắt kết nối (tắt tab, mất mạng)
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    // Cập nhật lại danh sách user online cho toàn bộ client
    io.emit('update_online_users', Array.from(onlineUsers.values()));
    console.log(`❌ User ngắt kết nối: ${username}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy thành công trên cổng ${PORT}`);
});