// ====== CẤU HÌNH CHUNG CHO CẢ 3 LINK (KHÁCH - CHỦ QUÁN - QUẢN TRỊ) ======
window.APP_CONFIG = {
  shopName: "Bếp Nhà Mình",
  pin: "358912", // Mã PIN bảo vệ trang Chủ quán (quan.html) & Quản trị (admin.html)

  ntfyTopic: "bepnhaminh-pos-2026", // Kênh đồng bộ mặc định gắn cứng
  bankId: "OCB",                    // Mã ngân hàng VietQR (OCB, MB, VCB, TCB, ACB, BIDV...)
  accountNo: "0987846022",          // Số tài khoản nhận tiền
  accountName: "LE BA TUAN",        // Tên chủ tài khoản (không dấu)

  historyRetentionDays: 3,          // Số ngày lưu lịch sử gần nhất (3 ngày)

  tables: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
  categories: ["Tất cả", "Đồ ăn", "Đồ uống", "Ăn vặt"],

  // Để dùng ảnh thật: tải ảnh vào thư mục `images/` trên GitHub rồi điền đường dẫn, VD: img: "images/pho-bo.jpg"
  menuItems: [
    {
      id: 1, name: "Phở Bò Tái Lăn", cat: "Đồ ăn", price: 55000,
      desc: "Nước dùng ninh xương 12h, thịt bò mềm thơm", emoji: "🍜", img: "",
      options: [
        { title: "Chọn tô", type: "single", choices: [{ label: "Tô thường", add: 0 }, { label: "Tô đặc biệt", add: 15000 }] },
        { title: "Ghi chú nhanh", type: "multi", choices: [{ label: "Không hành", add: 0 }, { label: "Nhiều nước béo", add: 0 }, { label: "Thêm quẩy", add: 5000 }] }
      ]
    },
    {
      id: 2, name: "Bún Chả Hà Nội", cat: "Đồ ăn", price: 50000,
      desc: "Chả nướng than hoa, nem rán giòn rụm", emoji: "🥢", img: "",
      options: [
        { title: "Thêm món kèm", type: "multi", choices: [{ label: "Thêm chả", add: 15000 }, { label: "Thêm nem rán", add: 10000 }, { label: "Không ớt", add: 0 }] }
      ]
    },
    {
      id: 3, name: "Cơm Tấm Sườn Bì Chả", cat: "Đồ ăn", price: 60000,
      desc: "Sườn nướng mật ong, mỡ hành, nước mắm kẹo", emoji: "🍛", img: "",
      options: [
        { title: "Thêm đồ ăn", type: "multi", choices: [{ label: "Thêm trứng ốp la", add: 8000 }, { label: "Thêm sườn", add: 20000 }, { label: "Ít cơm", add: 0 }] }
      ]
    },
    {
      id: 4, name: "Bánh Mì Chảo Đặc Biệt", cat: "Đồ ăn", price: 45000,
      desc: "Pate béo ngậy, trứng ốp la, xúc xích", emoji: "🥖", img: "",
      options: [
        { title: "Tùy chọn", type: "multi", choices: [{ label: "Thêm bánh mì", add: 5000 }, { label: "Không cay", add: 0 }] }
      ]
    },
    {
      id: 5, name: "Trà Sữa Trân Châu Đường Đen", cat: "Đồ uống", price: 35000,
      desc: "Trân châu nấu ấm dẻo, sữa tươi thanh trùng", emoji: "🧋", img: "",
      options: [
        { title: "Chọn Size", type: "single", choices: [{ label: "Size M", add: 0 }, { label: "Size L", add: 5000 }] },
        { title: "Mức đá / đường", type: "single", choices: [{ label: "Bình thường", add: 0 }, { label: "Ít đá, ít ngọt", add: 0 }, { label: "Không đá", add: 0 }] },
        { title: "Topping thêm", type: "multi", choices: [{ label: "Thêm trân châu", add: 8000 }, { label: "Kem cheese", add: 10000 }] }
      ]
    },
    {
      id: 6, name: "Cà Phê Sữa Đá Sài Gòn", cat: "Đồ uống", price: 29000,
      desc: "Cà phê rang mộc đậm đà, thơm lừng", emoji: "☕", img: "",
      options: [
        { title: "Chọn Size", type: "single", choices: [{ label: "Ly vừa", add: 0 }, { label: "Ly lớn", add: 6000 }] },
        { title: "Cách pha", type: "single", choices: [{ label: "Bình thường", add: 0 }, { label: "Ít sữa", add: 0 }, { label: "Nhiều sữa (Bạc xỉu)", add: 0 }] }
      ]
    },
    {
      id: 7, name: "Trà Đào Cam Sả", cat: "Đồ uống", price: 35000,
      desc: "Miếng đào giòn ngọt, hương sả thanh mát", emoji: "🍹", img: "",
      options: [
        { title: "Chọn Size", type: "single", choices: [{ label: "Size M", add: 0 }, { label: "Size L", add: 5000 }] },
        { title: "Tùy chọn", type: "multi", choices: [{ label: "Ít đá", add: 0 }, { label: "Thêm miếng đào", add: 8000 }] }
      ]
    },
    {
      id: 8, name: "Khoai Tây Chiên Lắc Phô Mai", cat: "Ăn vặt", price: 30000,
      desc: "Giòn rụm, phủ bột phô mai đậm vị", emoji: "🍟", img: ""
    },
    {
      id: 9, name: "Gà Rán Giòn Cay (2 miếng)", cat: "Ăn vặt", price: 48000,
      desc: "Kèm tương ớt & tương cà", emoji: "🍗", img: ""
    }
  ]
};
