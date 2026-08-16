// File phụ CHỈ để kiểm nguồn sổ nhật ký: nguồn được suy từ NGĂN XẾP LỜI GỌI, nên muốn
// kiểm "nhãn đổi theo nơi gọi" thì phải gọi thật sự từ một file khác.
async function congTien(db, userId, soTien) {
    return db.addMoney(userId, soTien, 'wallet');
}

module.exports = { congTien };
