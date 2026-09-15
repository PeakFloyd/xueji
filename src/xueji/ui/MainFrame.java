package xueji.ui;

import java.awt.BorderLayout;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JTabbedPane;

import xueji.dao.ClazzDao;
import xueji.dao.CourseDao;
import xueji.dao.DepartmentDao;
import xueji.dao.StudentDao;
import xueji.dao.TeacherDao;
import xueji.entity.Clazz;
import xueji.entity.Course;
import xueji.entity.Department;
import xueji.entity.Student;
import xueji.entity.Teacher;

/**
 * 学籍管理系统 · 管理员控制台主窗口。
 *
 * <p><b>定位</b>：本程序是本地运行、面向<b>系统管理员</b>的总控制台，
 * 覆盖数据库全部 8 张表；因运行在本机且面向可信运维者，故不设登录，
 * 打开即拥有全部数据的管理权限。面向学生/教师的<b>角色化自助端</b>
 * 是另一前端 {@code webui.py}（身份 = 主键 + RBAC）。两者读写同一份
 * {@code xueji.db}。</p>
 *
 * <p>界面采用页签 + 状态栏布局：基础单表（系 / 班级 / 学生 / 课程 / 教师）
 * 复用 {@link CrudPanel} 配置生成；联系表与要求表（授课 / 毕业要求 / 选课）
 * 因语义特殊使用专用面板。</p>
 */
public class MainFrame extends JFrame {

    private static final long serialVersionUID = 1L;

    private final DepartmentDao departmentDao = new DepartmentDao();
    private final ClazzDao clazzDao = new ClazzDao();
    private final StudentDao studentDao = new StudentDao();
    private final CourseDao courseDao = new CourseDao();
    private final TeacherDao teacherDao = new TeacherDao();

    private final JLabel statusLabel = new JLabel("就绪");

    /**
     * 构造主窗口并完成界面组装。
     */
    public MainFrame() {
        super("学籍管理系统 · 管理员控制台");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(900, 620);
        setLocationRelativeTo(null);

        JTabbedPane tabs = new JTabbedPane();
        tabs.addTab("系管理", buildDepartmentPanel());
        tabs.addTab("班级管理", buildClassPanel());
        tabs.addTab("学生管理", buildStudentPanel());
        tabs.addTab("教师管理", buildTeacherPanel());
        tabs.addTab("课程管理", buildCoursePanel());
        tabs.addTab("授课管理", new TeachingPanel());
        tabs.addTab("毕业要求", new GradRequirementPanel());
        tabs.addTab("选课与统计", new EnrollPanel());
        tabs.addChangeListener(e -> updateStatus());

        add(tabs, BorderLayout.CENTER);

        statusLabel.setBorder(BorderFactory.createEmptyBorder(4, 8, 4, 8));
        add(statusLabel, BorderLayout.SOUTH);

        updateStatus();
    }

    /** 构建"系管理"页签。 */
    private CrudPanel buildDepartmentPanel() {
        return new CrudPanel(
                new String[]{"系号", "系名"},
                () -> {
                    List<Object[]> rows = new java.util.ArrayList<>();
                    for (Department d : departmentDao.findAll()) {
                        rows.add(new Object[]{d.getDeptId(), d.getDeptName()});
                    }
                    return rows;
                },
                row -> {
                    try {
                        departmentDao.insert(new Department(str(row[0]), str(row[1])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        departmentDao.update(new Department(str(row[0]), str(row[1])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        departmentDao.delete(str(row[0]));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                });
    }

    /** 构建"班级管理"页签。 */
    private CrudPanel buildClassPanel() {
        return new CrudPanel(
                new String[]{"班号", "班名", "系号"},
                () -> {
                    List<Object[]> rows = new java.util.ArrayList<>();
                    for (Clazz c : clazzDao.findAll()) {
                        rows.add(new Object[]{c.getClassId(), c.getClassName(), c.getDeptId()});
                    }
                    return rows;
                },
                row -> {
                    try {
                        clazzDao.insert(new Clazz(str(row[0]), str(row[1]), str(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        clazzDao.update(new Clazz(str(row[0]), str(row[1]), str(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        clazzDao.delete(str(row[0]));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                });
    }

    /** 构建"学生管理"页签。 */
    private CrudPanel buildStudentPanel() {
        return new CrudPanel(
                new String[]{"学号", "姓名", "性别", "班号"},
                () -> {
                    List<Object[]> rows = new java.util.ArrayList<>();
                    for (Student s : studentDao.findAll()) {
                        rows.add(new Object[]{s.getStuId(), s.getStuName(), s.getGender(), s.getClassId()});
                    }
                    return rows;
                },
                row -> {
                    try {
                        studentDao.insert(new Student(str(row[0]), str(row[1]), str(row[2]), str(row[3])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        studentDao.update(new Student(str(row[0]), str(row[1]), str(row[2]), str(row[3])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        studentDao.delete(str(row[0]));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                });
    }

    /** 构建"教师管理"页签。 */
    private CrudPanel buildTeacherPanel() {
        return new CrudPanel(
                new String[]{"教师号", "姓名", "系号"},
                () -> {
                    List<Object[]> rows = new java.util.ArrayList<>();
                    for (Teacher t : teacherDao.findAll()) {
                        rows.add(new Object[]{t.getTeacherId(), t.getTeacherName(), t.getDeptId()});
                    }
                    return rows;
                },
                row -> {
                    try {
                        teacherDao.insert(new Teacher(str(row[0]), str(row[1]), str(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        teacherDao.update(new Teacher(str(row[0]), str(row[1]), str(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        teacherDao.delete(str(row[0]));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                });
    }

    /** 构建"课程管理"页签。 */
    private CrudPanel buildCoursePanel() {
        return new CrudPanel(
                new String[]{"课程号", "课程名", "学分"},
                () -> {
                    List<Object[]> rows = new java.util.ArrayList<>();
                    for (Course c : courseDao.findAll()) {
                        rows.add(new Object[]{c.getCourseId(), c.getCourseName(), c.getCredit()});
                    }
                    return rows;
                },
                row -> {
                    try {
                        courseDao.insert(new Course(str(row[0]), str(row[1]), toInt(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        courseDao.update(new Course(str(row[0]), str(row[1]), toInt(row[2])));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                },
                row -> {
                    try {
                        courseDao.delete(str(row[0]));
                        return null;
                    } catch (RuntimeException e) {
                        return e.getMessage();
                    }
                });
    }

    /** 更新底部状态栏（统计各表记录数）。 */
    private void updateStatus() {
        int dept = departmentDao.findAll().size();
        int clazz = clazzDao.findAll().size();
        int stu = studentDao.findAll().size();
        int teacher = teacherDao.count();
        int course = courseDao.findAll().size();
        statusLabel.setText(String.format(
                "统计：系 %d 个 | 班级 %d 个 | 学生 %d 人 | 教师 %d 位 | 课程 %d 门",
                dept, clazz, stu, teacher, course));
    }

    /** 将 Object 安全转为字符串。 */
    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    /** 将 Object 安全转为整数（学分）。 */
    private static int toInt(Object o) {
        try {
            return Integer.parseInt(str(o).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("学分必须是整数。");
        }
    }
}
