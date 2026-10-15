忽略此文件

第一步：检查 MySQL 数据库是否运行
先打开 Windows PowerShell，复制下面的命令并回车：
Get-Service MySQL84


查看输出里的 Status：
- Running：数据库已经运行，不需要启动。
- Stopped：数据库已停止，需要启动。
如果显示 Stopped，再执行：
Start-Service MySQL84


然后重新检查：
Get-Service MySQL84


确认状态变成 Running。

$secure = Read-Host "请输入 MySQL root 密码" -AsSecureString
$env:LINBLOG_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password

第二步：启动 LinBlog 后端
确认数据库正在运行后，在 PowerShell 中执行：
cd E:\project\LinBlog\serve


然后执行：
node .\linlog.js

第三步：启动前端服务
在 VS Code 中再新开一个终端，执行：
cd E:\project\LinBlog\lin_blog
npm.cmd run dev