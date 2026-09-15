package xueji.ui;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTabbedPane;
import javax.swing.JTable;
import javax.swing.table.DefaultTableModel;

import xueji.dao.CourseDao;
import xueji.dao.EnrollDao;
import xueji.dao.StudentDao;
import xueji.entity.Course;
import xueji.entity.Enroll;
import xueji.entity.Student;

/**
 * 选课管理与统计面板。
 *
 * <p>包含两个子页签：<b>选课/成绩</b>（对 m:n 联系表 enroll 进行录入、
 * 改成绩、退选）与<b>统计</b>（课程选修人数、班级选课人次）。</p>
 */
public class EnrollPanel extends JPanel {

    private static final long serialVersionUID = 1L;

    private final EnrollDao enrollDao = new EnrollDao();
    private final StudentDao studentDao = new StudentDao();
    private final CourseDao courseDao = new CourseDao();

    private final DefaultTableModel enrollModel;
    private final JTable enrollTable;

    /**
     * 构造选课管理面板。
     */
    public EnrollPanel() {
        setLayout(new BorderLayout());
        enrollModel = new DefaultTableModel(new String[]{
                "学号", "姓名", "课程号", "课程名", "成绩"}, 0) {
            private static final long serialVersionUID = 1L;

            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        enrollTable = new JTable(enrollModel);

        JTabbedPane tabs = new JTabbedPane();
        tabs.addTab("选课与成绩", buildEnrollPane());
        tabs.addTab("统计报表", buildStatPane());
        add(tabs, BorderLayout.CENTER);
    }

    /** 构建"选课与成绩"操作区。 */
    private JPanel buildEnrollPane() {
        JButton addBtn = new JButton("选课/录入成绩");
        JButton editBtn = new JButton("改成绩");
        JButton delBtn = new JButton("退选");
        JButton refBtn = new JButton("刷新");

        addBtn.addActionListener(e -> doEnroll());
        editBtn.addActionListener(e -> doUpdateScore());
        delBtn.addActionListener(e -> doDrop());
        refBtn.addActionListener(e -> refreshEnroll());

        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        bar.add(addBtn);
        bar.add(editBtn);
        bar.add(delBtn);
        bar.add(refBtn);

        JLabel tip = new JLabel("提示：学号与课程号须为库中已存在的值（外键约束）。");
        JPanel top = new JPanel(new BorderLayout());
        top.add(bar, BorderLayout.NORTH);
        top.add(tip, BorderLayout.SOUTH);

        JPanel pane = new JPanel(new BorderLayout());
        pane.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));
        pane.add(top, BorderLayout.NORTH);
        pane.add(new JScrollPane(enrollTable), BorderLayout.CENTER);
        refreshEnroll();
        return pane;
    }

    /** 构建"统计报表"区。 */
    private JPanel buildStatPane() {
        JButton refBtn = new JButton("刷新统计");
        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        bar.add(refBtn);

        DefaultTableModel courseModel = new DefaultTableModel(
                new String[]{"课程号", "课程名", "选修人数"}, 0);
        JTable courseTable = new JTable(courseModel);

        DefaultTableModel classModel = new DefaultTableModel(
                new String[]{"班级", "选课人次"}, 0);
        JTable classTable = new JTable(classModel);

        refBtn.addActionListener(e -> {
            loadCourseStat(courseModel);
            loadClassStat(classModel);
        });

        JTabbedPane inner = new JTabbedPane();
        inner.addTab("各课程选修人数", new JScrollPane(courseTable));
        inner.addTab("各班选课人次", new JScrollPane(classTable));

        loadCourseStat(courseModel);
        loadClassStat(classModel);

        JPanel pane = new JPanel(new BorderLayout());
        pane.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));
        pane.add(bar, BorderLayout.NORTH);
        pane.add(inner, BorderLayout.CENTER);
        return pane;
    }

    private void loadCourseStat(DefaultTableModel m) {
        m.setRowCount(0);
        for (Object[] row : enrollDao.statCourseCount()) {
            m.addRow(row);
        }
    }

    private void loadClassStat(DefaultTableModel m) {
        m.setRowCount(0);
        for (Object[] row : enrollDao.statClassEnroll()) {
            m.addRow(row);
        }
    }

    /** 刷新选课表格。 */
    private void refreshEnroll() {
        enrollModel.setRowCount(0);
        for (Enroll e : enrollDao.findAll()) {
            enrollModel.addRow(new Object[]{
                    e.getStuId(), e.getStuName(), e.getCourseId(),
                    e.getCourseName(), e.getScore()});
        }
    }

    /** 当前选中行的数据数组。 */
    private Object[] selectedEnrollRow() {
        int r = enrollTable.getSelectedRow();
        if (r < 0) {
            JOptionPane.showMessageDialog(this, "请先在表格中选择一条选课记录。");
            return null;
        }
        return enrollModel.getDataVector().get(enrollTable.convertRowIndexToModel(r)).toArray();
    }

    /** 选课/录入成绩：让用户选择一个学生和一门课程。 */
    private void doEnroll() {
        List<Student> students = studentDao.findAll();
        List<Course> courses = courseDao.findAll();
        if (students.isEmpty() || courses.isEmpty()) {
            JOptionPane.showMessageDialog(this, "请先录入学生与课程信息。");
            return;
        }
        Object stuChoice = JOptionPane.showInputDialog(this,
                "请选择学生：", "选课", JOptionPane.PLAIN_MESSAGE, null,
                students.toArray(), students.get(0));
        if (stuChoice == null) {
            return;
        }
        Student stu = (Student) stuChoice;
        Object courseChoice = JOptionPane.showInputDialog(this,
                "请选择课程：", "选课", JOptionPane.PLAIN_MESSAGE, null,
                courses.toArray(), courses.get(0));
        if (courseChoice == null) {
            return;
        }
        Course c = (Course) courseChoice;

        String scoreStr = JOptionPane.showInputDialog(this,
                "请输入成绩（0-100，可留空）：", "成绩", JOptionPane.PLAIN_MESSAGE);
        if (scoreStr == null) {
            return;
        }
        Double score;
        try {
            score = parseScore(scoreStr);
        } catch (IllegalArgumentException ex) {
            return; // 成绩非法，放弃本次操作
        }

        Enroll e = new Enroll(stu.getStuId(), c.getCourseId(), score);
        try {
            enrollDao.insert(e);
            refreshEnroll();
            JOptionPane.showMessageDialog(this, "选课成功。");
        } catch (RuntimeException ex) {
            JOptionPane.showMessageDialog(this, ex.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 修改当前选中记录的成绩。 */
    private void doUpdateScore() {
        Object[] row = selectedEnrollRow();
        if (row == null) {
            return;
        }
        String stuId = String.valueOf(row[0]);
        String courseId = String.valueOf(row[2]);
        String scoreStr = JOptionPane.showInputDialog(this,
                "请输入新成绩（0-100，可留空清除）：", "修改成绩");
        if (scoreStr == null) {
            return;
        }
        Double score;
        try {
            score = parseScore(scoreStr);
        } catch (IllegalArgumentException ex) {
            return; // 成绩非法，放弃本次操作
        }
        Enroll e = new Enroll(stuId, courseId, score);
        try {
            enrollDao.updateScore(e);
            refreshEnroll();
            JOptionPane.showMessageDialog(this, "成绩已更新。");
        } catch (RuntimeException ex) {
            JOptionPane.showMessageDialog(this, ex.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 退选当前选中记录。 */
    private void doDrop() {
        Object[] row = selectedEnrollRow();
        if (row == null) {
            return;
        }
        int confirm = JOptionPane.showConfirmDialog(this,
                "确定退选该门课程吗？", "确认", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) {
            return;
        }
        try {
            enrollDao.delete(String.valueOf(row[0]), String.valueOf(row[2]));
            refreshEnroll();
            JOptionPane.showMessageDialog(this, "退选成功。");
        } catch (RuntimeException ex) {
            JOptionPane.showMessageDialog(this, ex.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 解析成绩字符串，空串或 null 视为 null。 */
    private Double parseScore(String s) {
        if (s == null) {
            return null;
        }
        s = s.trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            double v = Double.parseDouble(s);
            if (v < 0 || v > 100) {
                throw new NumberFormatException();
            }
            return v;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("成绩必须是 0-100 的数字。");
        }
    }
}
