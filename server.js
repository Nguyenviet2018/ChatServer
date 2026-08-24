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
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
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

  // Nhận và lưu tin nhắn
// Nhận và lưu tin nhắn
  socket.on('send_message', async (data) => {
    const { room, message } = data;
    const sender = socket.user.username;

    // 1. Lưu tin nhắn mới vào cơ sở dữ liệu Supabase
    const { error } = await supabase
      .from('messages')
      .insert([{ room, sender, message }]);

    if (error) {
      console.error("Lỗi lưu tin nhắn vào DB:", error.message);
      return;
    }

    // 2. Kiểm tra tổng số lượng bản ghi trong bảng messages
    // Dùng { count: 'exact', head: true } để Supabase chỉ đếm số lượng nhanh chóng mà không cần tải dữ liệu về
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (!countError && count !== null) {
      console.log(`Hiện tại đang có ${count} tin nhắn trong DB.`);

      // Nếu số lượng đạt từ 50 bản ghi trở lên
      if (count >= 50) {
        console.log("Đã đạt 50 record, tiến hành xóa sạch dữ liệu bảng messages...");
        
        // Xóa toàn bộ dữ liệu trong bảng messages
        // Lưu ý: eq('room', room) nếu bạn chỉ muốn xóa trong phòng đó, 
        // còn nếu muốn xóa sạch tất cả phòng thì bỏ điều kiện .eq đi.
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .neq('id', 0); // Điều kiện luôn đúng để xóa toàn bộ bảng (hoặc dùng mẹo lọc id != 0)

        if (deleteError) {
          console.error("Lỗi khi xóa dữ liệu:", deleteError.message);
        } else {
          console.log("Đã xóa sạch dữ liệu bảng messages thành công!");
          
          // (Tùy chọn) Gửi thông báo hệ thống về client để làm mới giao diện chat nếu cần
          io.to(room).emit('receive_message', {
            sender: "Hệ thống",
            message: "⚠️ Đã đạt giới hạn 50 tin nhắn. Lịch sử chat vừa được làm sạch tự động!",
            created_at: new Date()
          });
        }
      }
    }

    // 3. Phát lại tin nhắn cho mọi người trong phòng
    io.to(room).emit('receive_message', {
      sender,
      message,
      created_at: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log(`Người dùng ngắt kết nối: ${socket.user.username}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});