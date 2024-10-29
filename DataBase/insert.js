var mysqlPool = require('mysqlPool');

mysqlPool.getConnection(
    if (err) {
      console.log("数据库连接失败");
    } else {
    console.log("数据库连接成功");
    // 定义sql查询语句
    let sql = "select * from stu";
    // 查询操作
    conn.query(sql, function (err, result) {
        if (err) {
            console.log("数据库查询失败");
        } else {
            res.send(result);
            conn.release();
        }
      })
}


var addSql = `INSERT INTO user_info(user_id, user_account, user_password, user_phone_number) VALUES('ccid_156432', 15779528372, '136139.qaq', 15779528372)`

connection.query(addSql, function(err, result){
    if(err){
        console.log('[INSERT ERROR] - ',err.message);
        return;
    }
    console.log('--------------------------INSERT----------------------------');
    //console.log('INSERT ID:',result.insertId);        
    console.log('INSERT ID:',result);        
    console.log('-----------------------------------------------------------------\n\n');  
})
connection.end();




mysqlPool.generateUniqueId()
               .then(jyId => {
                  mysqlPool.insertUserInfo(jyId, userInfoJson.password, userInfoJson.nickname, userInfoJson.phone)
                     .then(() => {
                        try {
                           fs.renameSync(path.join(req.file.destination, req.file.filename), path.join(req.file.destination, generatedJyId + ".png"));
                           console.log(`文件重命名成功: '${oldFileName}' -> '${newFileName}'`);
                        } catch (err) {
                           console.error(`文件重命名失败: ${err}`);
                        }
                        response.status = 200;
                        response.meg = "注册成功";
                        response.account = generatedJyId;
                        res.send(JSON.stringify(response));
                     })
               })
               .catch(err => {
                  response.status = 500
                  response.meg = err
                  res.send(JSON.stringify(response));
               })