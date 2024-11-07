var express = require('express');
const fs = require('fs')
const path = require('path')
var bodyParser = require('body-parser');
var mysqlPool = require('../DataBase/mysqlPool');
var checkInput = require('./checkInput')
const multer = require('multer');
var app = express();
const { v4: uuidv4 } = require('uuid');

var urlencodedParser = bodyParser.urlencoded({ extended: false })

const upload = multer({
   dest: 'C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar\\',
   fileFilter: function (req, file, cb) {
      console.log("asdfasdf")
      mysqlPool.isUserExist(req.body.phone, "user_phone")
         .then(isExist => {
            if (isExist) {
               cb(null, false)
               req.isUserExist = true
            } else {
               cb(null, true)
               req.isUserExist = false
            }
            req.isConn = true
         })
         .catch(err => {
            console.log(err)
            req.isConn = false
         })

   }
}).single('avatar')


app.post('/register', upload, (req, res) => {
   let response = {
      "status": '',
      "meg": ''
   };
   let userInfoJson = req.body;
   if (req.isConn) {
      if (!req.isUserExist) {
         if ('password' in userInfoJson && 'phone' in userInfoJson && checkInput(userInfoJson.password, userInfoJson.phone)) {
            mysqlPool.generateUniqueId()
               .then(jyId => {
                  const Chatuuid = uuidv4();
                  mysqlPool.insertUserInfo(jyId, userInfoJson.password, userInfoJson.nickname, userInfoJson.phone, Chatuuid)
                     .then(() => {
                        if(req.file && req.file.size > 0){
                           try {
                              fs.renameSync(path.join(req.file.destination, req.file.filename), path.join(req.file.destination, jyId + ".png"));
                              console.log(`文件重命名成功`);
                           } catch (err) {
                              console.error(`文件重命名失败: ${err}`);
                           }
                        }else{
                           try {
                              saveUserAvatar(jyId, getDefaultAvatar())
                              console.log(`默认头像保存成功: '${jyId}'`);
                           } catch (err) {
                              console.error(`默认头像保存失败: ${err}`);
                           }
                        }
                        response.status = 200;
                        response.meg = "注册成功";
                        response.account = jyId;
                        res.send(JSON.stringify(response));
                     })
               })
               .catch(err => {
                  response.status = 500
                  response.meg = err
                  res.send(JSON.stringify(response));
               })
         }else{
            response.status = 400;
            response.meg = "参数有误";
            res.send(JSON.stringify(response));
         }
      }else{
         response.status = 500
         response.meg = "用户已存在"
         res.send(JSON.stringify(response));
      }
   }else{
      response.status = 500
      response.meg = "连接失败"
      res.send(JSON.stringify(response));
   }
})

app.post('/login', urlencodedParser, (req, res) => {
   console.log("login被请求")
   var response = {
      "status": '',
      "meg": '',
   };
   let userLogJson = req.body;
   mysqlPool.pool.getConnection((err, conn) => {
      if (err) {
         console.log("数据库连接失败")
         response.status = 500;
         response.meg = "数据库连接失败";
         res.send(JSON.stringify(response))
      } else {
         querySql = 'select user_id, user_password, user_phone from user_info';
         conn.query(querySql, (err, result) => {
            conn.release();
            if (err) {
               console.log("数据库查询失败")
               response.status = 500;
               response.meg = "数据库查询失败";
               //不知道为什么不用send直接发
               res.send(JSON.stringify(response))
            } else {
               for (let i = 0; i < result.length; i++) {
                  if ((userLogJson.account == result[i].user_id || userLogJson.account == result[i].user_phone) && userLogJson.password == result[i].user_password) {
                     console.log("登录成功")
                     response.status = 200;
                     response.meg = "登录成功"
                     response.jyId = result[i].user_id
                     console.log(result[i].user_id)
                     console.log(JSON.stringify(response))
                     return res.send(JSON.stringify(response));
                     //!!!!!!!!!!!!!!!!!!!return!!!!!!!!!!!!!!!!!!!!!!!!!! 
                  }
               }
               console.log("账号或密码错误")
               response.status = 401;
               response.meg = "账号或密码错误"
               res.send(JSON.stringify(response))
            }
         })
      }
   })
})

app.post('/searchAccount', urlencodedParser, (req, res) => {
   console.log("/searchAccount被访问了")
   let response = {
      "status": '',
      "meg": ''
   };
   let userLogJson = req.body;
   mysqlPool.pool.getConnection((err, conn) => {
      if (err) {
         console.log("连接数据库失败");
         response.status = 500;
         response.meg = "数据库连接失败"
         return res.send(response);
      } else {
         let querySql = "select user_id, user_phone from user_info";
         conn.query(querySql, (err, result) => {
            conn.release();
            if (err) {
               console.log("数据库查询失败");
               response.status = 500;
               response.meg = "数据库查询失败";
               return res.send(response);
            } else {
               new Promise((resolve, reject) => {
                  for (let i = 0; i < result.length; i++) {
                     if (userLogJson.keyword == result[i].user_id || userLogJson.keyword == result[i].user_phone) {
                        response.status = 200;
                        response.meg = "查询成功"
                        resolve(mysqlPool.getUserComInfo(result[i].user_id));
                     }
                  }
                  reject()
               })
                  .then(user_info => {
                     console.log(user_info);
                     delete user_info.user_avatar;
                     response.userData = user_info;
                     console.log("该用户存在");
                     return res.send(JSON.stringify(response));
                  })
                  .catch(() => {
                     response.status = 200
                     response.meg = "该用户不存在"
                     console.log("该用户不存在");
                     return res.send(JSON.stringify(response));
                  })

            }
         })
      }
   })
})
var server = app.listen(8081, function () {

   var host = server.address().address
   var port = server.address().port

   console.log("应用实例，访问地址为 http://%s:%s", host, port)

})


function saveUserAvatar(jyid, avatarBuffer) {
   if (!fs.existsSync(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar`)) {
      fs.mkdir(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar`, { recursive: true }, err => {
         if (err) throw err;
      })
   }
   fs.writeFile(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar\\${jyid}.png`, avatarBuffer, { encoding: 'binary' }, err => {
      if (err) {
         console.error('写入文件时发生错误:', err);
      } else {
         console.log('文件已成功写入');
      }
   })
}

function getDefaultAvatar() {
   return fs.readFileSync(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar\\defaultAvatar.png`)
}