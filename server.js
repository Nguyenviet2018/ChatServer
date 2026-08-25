const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const supabase = require('./supabaseClient');
const authRoutes = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ các file tĩnh trong thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route phụ trả về file chat.html
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

const server = http.createServer(app);

// Cấu hình Socket.io với giới hạn nhận dữ liệu lớn hơn (để truyền ảnh/file Base64 lên tới 5MB)
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024 // Giới hạn 5MB cho mỗi gói tin gửi qua socket
});

const JWT_SECRET = process.env.JWT_SECRET;

// Gắn các API Routes
app.use('/api', authRoutes);

// --- BẢO MẬT SOCKET.IO VỚI JWT MIDDLEWARE ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Lỗi xác thực: Thiếu Token!"));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Lỗi xác thực: Token không hợp lệ!"));
    socket.user = decoded; // Gán thông tin user vào socket
    next();
  });
});

// --- XỬ LÝ SỰ KIỆN REAL-TIME CHAT ---
io.on('connection', (socket) => {
  console.log(`Người dùng đã kết nối: ${socket.user.username}`);

  // Tham gia phòng chat
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.user.username} đã vào phòng: ${room}`);
  });

  // Nhận, xử lý lưu tin nhắn và file đính kèm
  socket.on('send_message', async (data) => {
    const { room, message, file } = data;
    const sender = socket.user.username;

    // Chuẩn bị nội dung lưu vào DB (Nếu có file, lưu mô tả thay thế hoặc kết hợp)
    const dbMessage = message || (file ? `[Đính kèm file: ${file.name}]` : "");

    // 1. Lưu tin nhắn mới vào cơ sở dữ liệu Supabase
    const { error } = await supabase
      .from('messages')
      .insert([{ room, sender, message: dbMessage }]);

    if (error) {
      console.error("Lỗi lưu tin nhắn vào DB:", error.message);
      return;
    }

    // 2. Kiểm tra tổng số lượng bản ghi trong bảng messages
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (!countError && count !== null) {
      console.log(`Hiện tại đang có ${count} tin nhắn trong DB.`);

      // Nếu số lượng đạt từ 50 bản ghi trở lên
      if (count >= 50) {
        console.log("Đã đạt 50 record, tiến hành xóa sạch dữ liệu bảng messages...");
        
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .neq('id', 0); // Điều kiện luôn đúng để xóa toàn bộ bảng

        if (deleteError) {
          console.error("Lỗi khi xóa dữ liệu:", deleteError.message);
        } else {
          console.log("Đã xóa sạch dữ liệu bảng messages thành công!");
          
          // Gửi thông báo hệ thống về client
          io.to(room).emit('receive_message', {
            sender: "Hệ thống",
            message: "⚠️ Đã đạt giới hạn 50 tin nhắn. Lịch sử chat vừa được làm sạch tự động!",
            file: null,
            created_at: new Date()
          });
        }
      }
    }

    // 3. Phát lại tin nhắn (bao gồm cả nội dung text và file) cho mọi người trong phòng
    io.to(room).emit('receive_message', {
      sender,
      message,
      file, // Truyền tiếp file/ảnh sang các client khác
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