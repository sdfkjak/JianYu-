function checkReg(password, phone){
    if(6 <= password.length && password.length <= 16 && phone.length == 11){
        return true;
    }else{
        return false;
    }
}

module.exports = checkReg;